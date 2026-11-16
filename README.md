# Digital Product AI

Chatovací AI specializovaná na tvorbu a marketing digitálních produktů: validace nápadů, cena, výběr platformy, prodejní stránky, e-mailové sekvence, launch plány, diagnostika prodejů. Aktuální poplatky a ceny si ověřuje webovým vyhledáváním.

## Spuštění

Potřebuješ Node 22.9+ a API klíč z https://platform.claude.com/settings/keys.

```bash
npm install
cp .env.example .env   # doplň ANTHROPIC_API_KEY
npm start              # http://localhost:3000
```

## Nasazení

Repo má strukturu pro Vercel (`public/` + `api/chat.js`). V nastavení projektu přidej proměnné `ANTHROPIC_API_KEY` a `ACCESS_CODE`. Bez `ACCESS_CODE` může kdokoli s odkazem utrácet tvůj kredit.

## Úpravy

| Co | Kde |
|---|---|
| Chování a znalosti AI | `prompt.md` |
| Model, effort | proměnné `MODEL`, `EFFORT` (výchozí `claude-opus-5-5`, `high`) |
| Vzhled, úvodní návrhy | `public/index.html` |
| Volání Claude API | `api/chat.js` |

Webové vyhledávání musí být povolené v Claude Console (Settings → Privacy), jinak API požadavek odmítne.
