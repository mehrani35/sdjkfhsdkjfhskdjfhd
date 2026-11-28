# v0.3.1

- Extended the command-game DSL with validated text/number/choice inputs and atomic point spending for shops, resources and progression mechanics.
- Added stop-on-failed-prerequisite semantics so failed input/payment does not accidentally execute later rewards.
- Added retry/repair regression coverage: malformed agent output retries the same stage; invalid manifests run targeted repair and reviewer again.
- Kept generated source code disabled; the Gateway emits only the validated declarative command manifest.
