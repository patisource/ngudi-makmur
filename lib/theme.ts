// Tema tampilan per perangkat (19 Nov 2026): "light" | "dark" disimpan di localStorage; tidak ada = ikuti sistem.
// THEME_BOOT dijalankan di <head> sebelum halaman tergambar agar tidak berkedip (sama pola dengan SPLASH_BOOT).
export const THEME_KEY = "tema";
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
