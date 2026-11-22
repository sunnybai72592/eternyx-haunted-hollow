import type { Config } from "tailwindcss";

/**
 * Route-wide adaptive decorative color scales.
 * Every existing Tailwind text/bg/border/ring/gradient/hover variant using
 * these hue families now receives the selected ETERNYX auth palette, not
 * its original fixed blue/violet/pink pigment.
 *
 * Semantic success/error/warning palettes (emerald, green, rose, red, amber,
 * yellow, orange) remain untouched, as do vendor logos and image pixels.
 */
const paletteLightness = {
  50: 97, 100: 93, 200: 86, 300: 77, 400: 67, 500: 56,
  600: 47, 700: 38, 800: 29, 900: 19, 950: 11,
} as const;

const paletteScale = (hueShift = 0) =>
  Object.fromEntries(Object.entries(paletteLightness).map(([shade, light]) =>
    [shade, `hsl(calc(var(--eternyx-color-hue, 181) + ${hueShift}) var(--eternyx-color-saturation, 79%) ${light}% / <alpha-value>)`]
  ));



export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: '1rem',
				sm: '2rem',
				lg: '4rem',
				xl: '5rem',
				'2xl': '6rem',
			},
			screens: {
				'2xl': '1400px'
			}
		},
		screens: {
			'xs': '375px',
			'sm': '640px',
			'md': '768px',
			'lg': '1024px',
			'xl': '1280px',
			'2xl': '1536px',
			// Custom breakpoints for better mobile support
			'mobile': '320px',
			'tablet': '768px',
			'desktop': '1024px',
			'wide': '1440px',
		},
        extend: {
			spacing: {
				'safe-top': 'env(safe-area-inset-top)',
				'safe-bottom': 'env(safe-area-inset-bottom)',
				'safe-left': 'env(safe-area-inset-left)',
				'safe-right': 'env(safe-area-inset-right)',
			},
			minHeight: {
				'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
			},
			colors: {
                // Native Tailwind utility overrides: every page and state variant
                // picks up the global five-color swatch without page-specific CSS.
                cyan: paletteScale(0),
                sky: paletteScale(3),
                blue: paletteScale(6),
                indigo: paletteScale(10),
                violet: paletteScale(13),
                purple: paletteScale(16),
                fuchsia: paletteScale(20),
                pink: paletteScale(24),
                teal: paletteScale(-8),
				border: 'hsl(var(--border) / <alpha-value>)',
				input: 'hsl(var(--input) / <alpha-value>)',
				ring: 'hsl(var(--ring) / <alpha-value>)',
				background: 'hsl(var(--background) / <alpha-value>)',
				foreground: 'hsl(var(--foreground) / <alpha-value>)',
				primary: {
					DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
					foreground: 'hsl(var(--primary-foreground) / <alpha-value>)'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
					foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
					foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
					foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
					foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
					foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
				},
				card: {
					DEFAULT: 'hsl(var(--card) / <alpha-value>)',
					foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background) / <alpha-value>)',
					foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
					primary: 'hsl(var(--sidebar-primary) / <alpha-value>)',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground) / <alpha-value>)',
					accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground) / <alpha-value>)',
					border: 'hsl(var(--sidebar-border) / <alpha-value>)',
					ring: 'hsl(var(--sidebar-ring) / <alpha-value>)'
				},
				'cyber-green': 'hsl(var(--cyber-green) / <alpha-value>)',
				'cyber-cyan': 'hsl(var(--cyber-cyan) / <alpha-value>)',
				'cyber-pink': 'hsl(var(--cyber-pink) / <alpha-value>)',
				'cyber-orange': 'hsl(30 80% 55%)',
				'cyber-purple': 'hsl(var(--cyber-purple) / <alpha-value>)',
				'cyber-red': 'hsl(0 70% 50%)',
				'neon-blue': 'hsl(var(--neon-blue) / <alpha-value>)',
				'neon-green': 'hsl(var(--neon-green) / <alpha-value>)',
				'neon-pink': 'hsl(var(--cyber-pink) / <alpha-value>)',
				'neon-purple': 'hsl(var(--neon-purple) / <alpha-value>)',
				'neon-yellow': 'hsl(50 90% 60%)',
			},
			fontSize: {
				'xs': ['0.75rem', { lineHeight: '1rem' }],
				'sm': ['0.875rem', { lineHeight: '1.25rem' }],
				'base': ['1rem', { lineHeight: '1.5rem' }],
				'lg': ['1.125rem', { lineHeight: '1.75rem' }],
				'xl': ['1.25rem', { lineHeight: '1.75rem' }],
				'2xl': ['1.5rem', { lineHeight: '2rem' }],
				'3xl': ['1.875rem', { lineHeight: '2.25rem' }],
				'4xl': ['2.25rem', { lineHeight: '2.5rem' }],
				'5xl': ['3rem', { lineHeight: '1' }],
				'6xl': ['3.75rem', { lineHeight: '1' }],
				'7xl': ['4.5rem', { lineHeight: '1' }],
				'8xl': ['6rem', { lineHeight: '1' }],
				'9xl': ['8rem', { lineHeight: '1' }],
				// Mobile-optimized sizes
				'mobile-xs': ['0.625rem', { lineHeight: '0.875rem' }],
				'mobile-sm': ['0.75rem', { lineHeight: '1rem' }],
				'mobile-base': ['0.875rem', { lineHeight: '1.25rem' }],
				'mobile-lg': ['1rem', { lineHeight: '1.5rem' }],
				'mobile-xl': ['1.125rem', { lineHeight: '1.75rem' }],
				'mobile-2xl': ['1.25rem', { lineHeight: '1.75rem' }],
				'mobile-3xl': ['1.5rem', { lineHeight: '2rem' }],
				'mobile-4xl': ['1.875rem', { lineHeight: '2.25rem' }],
				'mobile-5xl': ['2.25rem', { lineHeight: '2.5rem' }],
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'glitch-1': {
					'0%, 100%': { transform: 'translate(0)' },
					'20%': { transform: 'translate(-2px, 2px)' },
					'40%': { transform: 'translate(-2px, -2px)' },
					'60%': { transform: 'translate(2px, 2px)' },
					'80%': { transform: 'translate(2px, -2px)' },
				},
				'glitch-2': {
					'0%, 100%': { transform: 'translate(0)' },
					'20%': { transform: 'translate(2px, 2px)' },
					'40%': { transform: 'translate(2px, -2px)' },
					'60%': { transform: 'translate(-2px, 2px)' },
					'80%': { transform: 'translate(-2px, -2px)' },
				},
				'blink': {
					'0%, 50%': { opacity: '1' },
					'51%, 100%': { opacity: '0' },
				},
				'typing': {
					'from': { width: '0' },
					'to': { width: '100%' },
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-20px)' },
				},
				'pulse-glow': {
					'0%, 100%': { 
						boxShadow: '0 0 5px hsl(var(--neon-green) / 0.5)',
					},
					'50%': { 
						boxShadow: '0 0 20px hsl(var(--neon-green) / 0.8), 0 0 30px hsl(var(--neon-green) / 0.4)',
					},
				},
				'data-stream': {
					'0%': { transform: 'translateY(-100%)' },
					'100%': { transform: 'translateY(100%)' },
				},
				'matrix-rain': {
					'0%': { transform: 'translateY(-100%)' },
					'100%': { transform: 'translateY(100%)' },
				},
				'scan': {
					'0%': { transform: 'translateY(-100%)' },
					'100%': { transform: 'translateY(200vh)' },
				},
				'float-effect': {
					'0%, 100%': { transform: 'translateY(0) translateX(0)' },
					'25%': { transform: 'translateY(-5px) translateX(5px)' },
					'50%': { transform: 'translateY(0) translateX(0)' },
					'75%': { transform: 'translateY(5px) translateX(-5px)' },
				},
				'pulse-soft': {
					'0%, 100%': { transform: 'scale(1)' },
					'50%': { transform: 'scale(1.03)' },
				},
				'neon-pulse': {
					'0%, 100%': { boxShadow: '0 0 5px var(--neon-color)' },
					'50%': { boxShadow: '0 0 20px var(--neon-color), 0 0 30px var(--neon-color)' },
				},
				'twinkle': {
					'0%, 100%': { opacity: '1', transform: 'scale(1)' },
					'50%': { opacity: '0.3', transform: 'scale(0.8)' },
				},
				'shooting-star': {
					'0%': { transform: 'translate(0, 0) rotate(45deg)', opacity: '1' },
					'70%': { opacity: '1' },
					'100%': { transform: 'translate(300px, 300px) rotate(45deg)', opacity: '0' },
				},
				'spin-slow': {
					'from': { transform: 'rotate(0deg)' },
					'to': { transform: 'rotate(360deg)' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'glitch-1': 'glitch-1 2s infinite',
				'glitch-2': 'glitch-2 2s infinite',
				'blink': 'blink 1s infinite',
				'typing': 'typing 3.5s steps(40, end)',
				'float': 'float 6s ease-in-out infinite',
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite alternate',
				'data-stream': 'data-stream 10s linear infinite',
				'matrix-rain': 'matrix-rain 15s linear infinite',
				'scan': 'scan 3s linear infinite',
				'float-effect': 'float-effect 4s ease-in-out infinite',
				'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
				'neon-pulse': 'neon-pulse 2s ease-in-out infinite alternate',
				'twinkle': 'twinkle 2s ease-in-out infinite',
				'shooting-star': 'shooting-star 3s linear infinite',
				'spin-slow': 'spin-slow 3s linear infinite',
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
