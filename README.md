# Rich Message Mini App — Rebuild

Clean rebuild of the Telegram Rich Message editor.

Architecture:
- internal document model independent of Telegram's API schema
- block-local keyboard behavior
- separate Telegram serializer/validator
- server-only bot token and authorization
- Telegram CloudStorage for user-owned saved channel settings
- mobile-first Telegram-native UI

The implementation is checked against the current official Telegram Bot API Rich Message and Mini Apps documentation as those APIs evolve.
