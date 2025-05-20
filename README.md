# Instagram Story Tracker Telegram Bot

A Telegram bot that allows users to track Instagram stories and receive notifications when new stories are posted.

## Architecture

See [architecture.md](architecture.md) for detailed system design and component breakdown.

## Development

This is a monorepo containing:
- `apps/bot`: Telegram bot service
- `apps/frontend`: Next.js web dashboard
- `apps/scraper`: Instagram story checking service
- `shared`: Shared types and utilities
- `supabase`: Database schema and functions 