export function getTelegramWebApp(){return typeof window!=='undefined'?window.Telegram?.WebApp??null:null;}
export function initTelegramWebApp(){const app=getTelegramWebApp();if(!app)return null;app.ready();app.expand();app.setHeaderColor?.('bg_color');app.setBackgroundColor?.('bg_color');return app;}
export function getTelegramUser(){return getTelegramWebApp()?.initDataUnsafe?.user??null;}
export function configureTelegramNavigation({onBack,onSettings}){const app=getTelegramWebApp();if(!app)return()=>{};const back=()=>onBack?.(),settings=()=>onSettings?.();app.BackButton?.onClick?.(back);app.SettingsButton?.onClick?.(settings);return()=>{app.BackButton?.offClick?.(back);app.SettingsButton?.offClick?.(settings);};}
export function setTelegramNavigation({showBack=false,showSettings=false}={}){const app=getTelegramWebApp();if(!app)return;showBack?app.BackButton?.show?.():app.BackButton?.hide?.();showSettings?app.SettingsButton?.show?.():app.SettingsButton?.hide?.();}
export function telegramHaptic(type='success'){getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);}
export function telegramImpact(style='light'){getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);}
