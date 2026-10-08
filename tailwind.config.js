module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#ffffff", warm: "#faf9f6", ink: "#0a0a0a", "ink-soft": "#262626", graphite: "#4a4a4a",
        slate: "#5d6678", stone: "#8c8c8c", ash: "#a9a9a9", hairline: "#efefec", "hairline-soft": "#e4e4e1",
        cool: "#eef0f2", scrim: "#0c0c10", footer: "#050505", coral: "#e8604c",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"] },
      borderRadius: { xs: "4px", sm: "6px", md: "8px", lg: "16px" },
    },
  },
  plugins: [],
};
