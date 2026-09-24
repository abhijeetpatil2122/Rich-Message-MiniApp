export function getTelegramWebApp(){return typeof window!=='undefined'?window.Telegram?.WebApp??null:null;}
export function initTelegramWebApp(){const app=getTelegramWebApp();if(!app)return null;app.ready();app.expand();app.setHeaderColor?.('bg_color');app.setBackgroundColor?.('bg_color');return app;}
export function getTelegramUser(){return getTelegramWebApp()?.initDataUnsafe?.user??null;}
