# TermPaper shell integration shim: loaded with --init-command after the user's own
# config.fish, so their prompt is already defined. Adds OSC 133 marks around it.
# C = output start. A = prompt start, B = command input start.
function __termpaper_preexec --on-event fish_preexec
    printf '\e]133;C\a'
end
functions -q fish_prompt; and functions -c fish_prompt __termpaper_user_prompt
function fish_prompt
    printf '\e]133;A\a'
    __termpaper_user_prompt
    printf '\e]133;B\a'
end
