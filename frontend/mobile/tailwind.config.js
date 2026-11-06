const { hairlineWidth } = require('nativewind/theme');
const plugin = require('tailwindcss/plugin');

// React Native can't switch weights inside one font file, so each weight utility points at its own
// Inter file (loaded in the root layout from @expo-google-fonts/inter).
const interWeights = plugin(({ addUtilities }) => {
  addUtilities({
    '.font-sans': { fontFamily: 'Inter_400Regular' },
    '.font-normal': { fontFamily: 'Inter_400Regular' },
    '.font-medium': { fontFamily: 'Inter_500Medium' },
    '.font-semibold': { fontFamily: 'Inter_600SemiBold' },
    '.font-bold': { fontFamily: 'Inter_700Bold' },
  });
});

const color = (name) => `hsl(var(--${name}))`;

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // The base font (Tailwind's preflight puts it on <html>, which web text inherits).
      fontFamily: { sans: ['Inter_400Regular'] },
      // The variables are generated from the web's globals.css (scripts/sync-theme.js).
      colors: {
        // Fixed brand values from the logo guidelines, the same in both themes.
        brand: { lime: '#d7f205', ink: '#11120d' },
        border: color('border'),
        input: color('input'),
        ring: color('ring'),
        background: color('background'),
        foreground: color('foreground'),
        primary: { DEFAULT: color('primary'), foreground: color('primary-foreground'), text: color('primary-text') },
        secondary: { DEFAULT: color('secondary'), foreground: color('secondary-foreground') },
        destructive: { DEFAULT: color('destructive'), foreground: color('destructive-foreground') },
        muted: { DEFAULT: color('muted'), foreground: color('muted-foreground') },
        accent: { DEFAULT: color('accent'), foreground: color('accent-foreground') },
        popover: { DEFAULT: color('popover'), foreground: color('popover-foreground') },
        card: { DEFAULT: color('card'), foreground: color('card-foreground') },
        success: color('success'),
        warning: color('warning'),
        bar: color('bar'),
        'chart-1': color('chart-1'),
        'chart-2': color('chart-2'),
        'chart-3': color('chart-3'),
        'chart-4': color('chart-4'),
        'chart-5': color('chart-5'),
        'chart-6': color('chart-6'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      borderWidth: { hairline: hairlineWidth() },
    },
  },
  plugins: [require('tailwindcss-animate'), interWeights],
};
