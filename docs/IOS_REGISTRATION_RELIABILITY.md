# iOS registration and rules acceptance reliability

## Observed failure modes

The previous registration flow could appear unresponsive on some iOS devices because several independent operations were coupled to the rules modal:

- the modal could open while iOS was still finishing the previous keyboard input session;
- the accept callback was not awaited by the modal and errors were rendered behind it;
- repeated QR scan events could start multiple invitation-preview requests;
- the authenticated session was published before rules acceptance, starting chat, realtime, push and badge work under the modal;
- account creation and rules acceptance were separate requests, so a retry could attempt registration again after the account already existed;
- player avatar preparation and upload were part of the critical registration path;
- navigation or a PUSH prompt could start before the native modal was fully dismissed.

## Client safeguards

The updated client now:

1. dismisses the keyboard and allows the iOS text-input session to settle before presenting the rules modal;
2. uses `Pressable` controls with explicit hit areas and a synchronous submission lock;
3. awaits acceptance, displays failures inside the modal and logs press-in, press, start, success and failure stages;
4. deduplicates invitation previews and accepts only the first QR event;
5. uses the additive atomic registration endpoint and publishes the session only after rules acceptance succeeds;
6. falls back to the legacy two-step API only for HTTP 404 or 405 during staged deployment;
7. defers automatic player-avatar reconciliation until after registration;
8. waits for `Modal.onDismiss` before showing the PUSH prompt or navigating.

## Backward compatibility

Older clients are unaffected because the server keeps the existing registration and rules-acceptance routes unchanged. The updated client can also operate temporarily against an older server through its scoped 404/405 fallback.

## Diagnostics

The registration flow emits structured events including:

```text
rules.modal.opened
rules.modal.shown
rules.checkbox.changed
rules.accept.press_in
rules.accept.press
rules.accept.started
rules.accept.succeeded
rules.accept.failed
auth.registration.started
auth.registration.atomic_started
auth.registration.atomic_completed
auth.registration.succeeded
auth.registration.failed
rules.modal.dismissed
```

These events distinguish native touch delivery, request execution, server failure and modal-transition problems without logging credentials or invitation tokens.

## Release validation

Before distribution, validate:

- QR scan sends one invitation-preview request;
- the keyboard is closed before rules presentation;
- the first valid tap starts the operation;
- an offline or server error is visible inside the modal and can be retried;
- successful registration records accepted rules and opens the first-run profile after the modal is dismissed;
- released legacy clients still register through the existing two-step endpoints.
