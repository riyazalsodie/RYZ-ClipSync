# RYZ ClipSync v1.1.0

## ✨ Features

- add encrypted backup container export and restore engine (`.clipsyncbak`)
- add AES-256-GCM authenticated encryption with scrypt key derivation
- add bundled screenshot assets packaging and disk extraction on restore
- add dual restore modes: Merge (non-destructive duplicate-free) and Full Replace
- add sleek cyberpunk checkboxes and radio selectors with spring-animated SVG checkmarks
- add FontAwesome SVG vector icons across settings and backup dialogs (zero emojis)

## 🐛 Bug Fixes

- fix ReferenceError: encrypted is not defined during backup export
- correct inverted export and restore icon directions in settings and dialogs
- prevent duplicate clip insertion when restoring backups in merge mode
- sanitize and validate backup passwords and container payload integrity
