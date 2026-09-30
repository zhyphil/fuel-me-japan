# Fuel Japan — M0 i18n

Frozen locales:
- en
- zh-Hant
- ko
- zh-Hans
- th

Japanese reference labels:
- Regular — レギュラー
- High Octane — ハイオク
- Diesel — 軽油
- Self Service — セルフ
- Cash — 現金
- Member — 会員
- Full Tank — 満タン

Rules:
- Never translate away Japanese labels on safety-critical screens.
- Safety copy must be reviewed before production promotion.
- All UI uses structured locale keys.
- SEO pages/metadata are genuinely localized.
- Fallback: requested locale → English → Japanese reference label where relevant.
- Future locales are chosen from real traffic/usage evidence.
