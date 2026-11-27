# Security policy

## Supported versions

Only the latest release of Teleprompter Plus gets security fixes. Before you report, check that the problem is still there in the [latest release](https://github.com/JuracyAmerico/obsidian-teleprompter-plus/releases/latest).

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Anything older | No: update first |

## Reporting a vulnerability

Please do not put the details of a vulnerability in a public issue, pull request or comment.

1. If this repository's **Security** tab shows **Report a vulnerability**, use it. The report stays private between you and the maintainer.
2. If it does not, [open an issue](https://github.com/JuracyAmerico/obsidian-teleprompter-plus/issues/new) titled "Security: private contact needed", with no details. The maintainer will reply there with a private way to send them.

Say which version you tested, on which operating system, and what an attacker can do. A proof of concept helps.

This is a one-person project, so a reply may take a few days. Once a fix is released, the changelog names the problem, and you are credited if you want to be.

## What is in scope

The plugin's own code in this repository: the local WebSocket server and the phone remote page, the programs it starts on your computer, and the files it reads and writes. [ATTACKSURFACE.md](ATTACKSURFACE.md) lists each of these surfaces and how it is protected; the README's [What it touches](README.md#what-it-touches) lists every program, file and network host.

In scope, as in [ATTACKSURFACE.md § Scope and attacker model](ATTACKSURFACE.md#scope-and-attacker-model):

- **Files someone else put in a vault you open**: a note, PDF or other file in a shared or synced vault, or a downloaded folder of notes. Opening or prompting them must not run code, reach the network or change settings.
- **A settings or profile file you import**, or a profile you apply: it must not set secrets or widen network use without your confirmation.
- **A device on your network**, once you have set the server host to `0.0.0.0` for the phone remote.
- **A web page in your browser**, reaching the server on this computer.
- **A program on your computer**, only where the plugin gives it something it would not otherwise have, such as a key-free control channel or the microphone.

Out of scope: Obsidian itself, ElevenLabs, OBS, the Vosk and Kokoro models; anyone who can already run code as you; and anyone who can write your vault's `.obsidian` folder, because that folder holds the plugin's own code (`main.js`) next to its settings, so they can replace the plugin.
