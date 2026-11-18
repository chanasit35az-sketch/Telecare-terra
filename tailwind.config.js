// Tailwind theme copied verbatim from the original TeleCare Terra design files (Terra — Organic Design).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js', './server/print.js'],
  darkMode: 'class',
  theme: {
    "extend": {
      "colors": {
        "inverse-on-surface": "#f5f0e8",
        "inverse-surface": "#2e3230",
        "surface-bright": "#faf6f0",
        "error-container": "#ffdad8",
        "on-secondary-fixed-variant": "#4a4538",
        "on-primary-fixed-variant": "#2a6038",
        "surface-variant": "#e4e0d8",
        "primary-fixed-dim": "#8ecf9e",
        "surface-container-lowest": "#ffffff",
        "on-surface-variant": "#4a4e4a",
        "on-error": "#ffffff",
        "outline": "#74796e",
        "tertiary-container": "#c4a66a",
        "on-primary-container": "#d8f0de",
        "primary": "#4a7c59",
        "on-error-container": "#690005",
        "secondary-fixed-dim": "#d4ccbf",
        "outline-variant": "#c4c8bc",
        "surface-container-low": "#f5f1ea",
        "error": "#b83230",
        "primary-container": "#78a886",
        "tertiary-fixed-dim": "#dcc48e",
        "surface-container": "#f0ece4",
        "inverse-primary": "#8ecf9e",
        "on-tertiary-container": "#554020",
        "secondary": "#6b6358",
        "surface-container-high": "#eae6de",
        "on-secondary": "#ffffff",
        "on-secondary-fixed": "#1e1a13",
        "on-background": "#2e3230",
        "tertiary": "#705c30",
        "secondary-fixed": "#f0e8db",
        "surface": "#faf6f0",
        "surface-container-highest": "#e4e0d8",
        "surface-tint": "#4a7c59",
        "primary-fixed": "#c8e8d0",
        "tertiary-fixed": "#f8e0a8",
        "on-tertiary-fixed": "#221a05",
        "on-primary": "#ffffff",
        "secondary-container": "#f0e8db",
        "on-secondary-container": "#5e5548",
        "on-tertiary-fixed-variant": "#554020",
        "background": "#faf6f0",
        "on-surface": "#2e3230",
        "on-primary-fixed": "#002110",
        "surface-dim": "#dbd7cf",
        "on-tertiary": "#ffffff"
      },
      "borderRadius": {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "full": "9999px"
      },
      "spacing": {},
      "fontFamily": {
        "headline": [
          "Literata"
        ],
        "display": [
          "Literata"
        ],
        "body": [
          "Nunito Sans"
        ],
        "label": [
          "Nunito Sans"
        ]
      },
      "fontSize": {}
    }
  },
};
