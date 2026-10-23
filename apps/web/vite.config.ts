import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// VITE_BASE="/conceptual-map-in-work/" per GitHub Pages; "./" per Capacitor/APK
export default defineConfig({ base: process.env.VITE_BASE ?? "./", plugins: [react()] });
