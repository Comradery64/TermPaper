use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Manager, State};

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

/// The live shell, and a count of shells spawned so a replaced one can tell it was replaced.
#[derive(Default)]
struct PtyState(Mutex<Option<Pty>>, AtomicU64);

#[tauri::command]
fn spawn(window: tauri::WebviewWindow, state: State<PtyState>, cols: u16, rows: u16, on_data: Channel<Vec<u8>>) -> Result<bool, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let generation = state.1.fetch_add(1, Ordering::SeqCst) + 1;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) { "powershell.exe".into() } else { "/bin/sh".into() }
    });
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("TERM_PROGRAM", "TermPaper");
    let mut integrated = false;   // true when the shell will emit OSC 133 prompt marks
    let name = std::path::Path::new(&shell).file_name().and_then(|n| n.to_str()).unwrap_or("");
    let app = window.app_handle();
    match name {
        "zsh" => {
            let files = [(".zshenv", include_str!("../shell/zsh/.zshenv")), (".zshrc", include_str!("../shell/zsh/.zshrc"))];
            if let Ok(dir) = install_shim(app, "zsh", &files) {
                integrated = true;
                if let Some(user) = std::env::var_os("ZDOTDIR") {
                    cmd.env("TERMPAPER_USER_ZDOTDIR", user);
                }
                cmd.env("ZDOTDIR", dir);
            }
        }
        "bash" => {
            if let Ok(dir) = install_shim(app, "bash", &[("bashrc", include_str!("../shell/bash/bashrc"))]) {
                integrated = true;
                cmd.arg("--rcfile");
                cmd.arg(dir.join("bashrc"));
            }
        }
        "fish" => {
            if let Ok(dir) = install_shim(app, "fish", &[("termpaper.fish", include_str!("../shell/fish/termpaper.fish"))]) {
                integrated = true;
                cmd.env("TERMPAPER_FISH_INIT", dir.join("termpaper.fish"));
                cmd.args(["--init-command", "source $TERMPAPER_FISH_INIT"]);
            }
        }
        _ => {}
    }
    if let Some(home) = std::env::var_os("HOME") {
        cmd.cwd(home);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 || on_data.send(buf[..n].to_vec()).is_err() {
                break;
            }
        }
        // the shell exited (`exit`, ^D): close the window, like any terminal. A shell
        // killed because a reload spawned a new one is not current, so it leaves it open.
        if window.state::<PtyState>().1.load(Ordering::SeqCst) == generation {
            let _ = window.close();
        }
    });

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    // a frontend reload calls spawn again: end the previous shell instead of orphaning it
    if let Some(mut old) = state.0.lock().unwrap().take() {
        let _ = old.child.kill();
    }
    *state.0.lock().unwrap() = Some(Pty { master: pair.master, writer, child });
    Ok(integrated)
}

#[tauri::command]
fn write(state: State<PtyState>, data: Vec<u8>) -> Result<(), String> {
    if let Some(p) = state.0.lock().unwrap().as_mut() {
        p.writer.write_all(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize(state: State<PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(p) = state.0.lock().unwrap().as_ref() {
        p.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Write a bundled shell shim to the app's own data dir (private to the user, unlike a
/// temp dir another account could pre-create) and return the dir.
fn install_shim(app: &tauri::AppHandle, shell: &str, files: &[(&str, &str)]) -> std::io::Result<std::path::PathBuf> {
    let dir = app.path().app_data_dir().map_err(std::io::Error::other)?.join(shell);
    std::fs::create_dir_all(&dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    }
    for (name, body) in files {
        std::fs::write(dir.join(name), body)?;
    }
    Ok(dir)
}

/// Fade the macOS titlebar widgets (close/minimize/zoom) in or out.
/// Animates their container (NSTitlebarView) rather than the buttons: AppKit
/// resets button alpha on hover/focus changes, which made the fade snap back.
#[tauri::command]
fn traffic_lights(window: tauri::Window, visible: bool, duration: f64) {
    #[cfg(target_os = "macos")]
    {
        let w = window.clone();
        let _ = window.run_on_main_thread(move || {
            use objc2_app_kit::{NSAnimationContext, NSWindow, NSWindowButton};
            let Ok(ptr) = w.ns_window() else { return };
            let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
            let Some(btn) = ns.standardWindowButton(NSWindowButton::CloseButton) else { return };
            let Some(bar) = (unsafe { btn.superview() }) else { return };
            let alpha = if visible { 1.0 } else { 0.0 };
            NSAnimationContext::beginGrouping();
            NSAnimationContext::currentContext().setDuration(duration);
            unsafe {
                let anim: objc2::rc::Retained<objc2::runtime::AnyObject> = objc2::msg_send![&*bar, animator];
                let _: () = objc2::msg_send![&*anim, setAlphaValue: alpha];
            }
            NSAnimationContext::endGrouping();
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (window, visible, duration);
}

/// Settings live in the app's config dir so they persist across sessions; the
/// webview's localStorage is keyed to the dev-server origin and resets when it changes.
/// `settings.toml` sits next to `prefs.json` with the same keys, is meant to be edited by hand,
/// and wins on load; every save from the Settings UI rewrites both.
fn merge_settings(prefs_json: Option<&str>, toml_src: Option<&str>) -> Option<String> {
    let mut base = prefs_json.and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .filter(serde_json::Value::is_object).unwrap_or_else(|| serde_json::json!({}));
    if let Some(src) = toml_src {
        match toml::from_str::<serde_json::Value>(src) {
            Ok(serde_json::Value::Object(over)) => {
                let b = base.as_object_mut()?;
                for (k, v) in over {
                    match (b.get_mut(&k), v) {      // colors merge per role, everything else replaces
                        (Some(serde_json::Value::Object(bm)), serde_json::Value::Object(om)) => bm.extend(om),
                        (_, v) => { b.insert(k, v); }
                    }
                }
            }
            Ok(_) => {}
            Err(e) => eprintln!("settings.toml ignored: {e}"),
        }
    }
    (prefs_json.is_some() || toml_src.is_some()).then(|| base.to_string())
}

#[tauri::command]
fn load_prefs(app: tauri::AppHandle) -> Option<String> {
    let dir = app.path().app_config_dir().ok()?;
    let read = |f: &str| std::fs::read_to_string(dir.join(f)).ok();
    merge_settings(read("prefs.json").as_deref(), read("settings.toml").as_deref())
}

#[tauri::command]
fn save_prefs(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let toml = serde_json::from_str::<toml::Value>(&json).ok().and_then(|v| toml::to_string_pretty(&v).ok());
    if let Some(t) = toml { std::fs::write(dir.join("settings.toml"), t).map_err(|e| e.to_string())?; }
    std::fs::write(dir.join("prefs.json"), json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::merge_settings;

    #[test]
    fn toml_overrides_prefs() {
        let m = merge_settings(Some(r##"{"fontSize":17,"colors":{"ink":"#111111","flag":"#222222"}}"##),
            Some("fontSize = 20\ncursor = \"block\"\n[colors]\nink = \"#abcdef\"\n")).unwrap();
        let v: serde_json::Value = serde_json::from_str(&m).unwrap();
        assert_eq!(v["fontSize"], 20);
        assert_eq!(v["cursor"], "block");
        assert_eq!(v["colors"]["ink"], "#abcdef");
        assert_eq!(v["colors"]["flag"], "#222222");
    }

    #[test]
    fn bad_toml_falls_back() {
        let m = merge_settings(Some(r#"{"fontSize":17}"#), Some("fontSize = = oops")).unwrap();
        assert_eq!(m, r#"{"fontSize":17}"#);
        assert!(merge_settings(None, None).is_none());
    }
}

/// Dock icon from the PNG embedded in the binary. A bare `target/debug` binary has no .app bundle,
/// so without this it shows the generic exec icon; in a bundle it just matches the bundle icon.
#[cfg(target_os = "macos")]
fn set_dock_icon(app: &tauri::AppHandle) {
    let _ = app.run_on_main_thread(|| {
        use objc2::{AllocAnyThread, MainThreadMarker};
        use objc2_app_kit::{NSApplication, NSImage};
        let Some(mtm) = MainThreadMarker::new() else { return };
        let data = objc2_foundation::NSData::with_bytes(include_bytes!("../icons/icon.png"));
        let Some(img) = NSImage::initWithData(NSImage::alloc(), &data) else { return };
        unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&img)) };
    });
}

/// Startup timings from the frontend, appended to startup.log only when TERMPAPER_PERF is set.
/// Adds the process uptime so the page's own clock can be placed on the process timeline.
#[tauri::command]
fn perf_log(app: tauri::AppHandle, text: String) {
    if std::env::var_os("TERMPAPER_PERF").is_none() { return; }
    let up = START.get().map(|t| t.elapsed().as_millis()).unwrap_or(0);
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("startup.log")) {
            use std::io::Write;
            let _ = writeln!(f, "rust_uptime_ms={up} {text}");
        }
    }
}

static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

pub fn run() {
    START.get_or_init(std::time::Instant::now);
    tauri::Builder::default()
        .manage(PtyState::default())
        .setup(|app| {
            // Default menu gives Cmd+C/V/X/A and Quit on macOS.
            app.set_menu(tauri::menu::Menu::default(app.handle())?)?;
            #[cfg(target_os = "macos")]
            set_dock_icon(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![spawn, write, resize, traffic_lights, load_prefs, save_prefs, perf_log])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
