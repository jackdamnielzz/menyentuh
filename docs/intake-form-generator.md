# Intake/Anamnese Word Generator

Deze repo bevat een automatische pipeline om een invulbaar intake/anamneseformulier voor Menyentuh te genereren.

## Bestanden

- Spec: `forms/intake_anamnese_spec.json`
- Generator: `scripts/generate_intake_form.py`
- Output: `output/Menyentuh_Intake_Anamnese.docx`

## Vereisten

- Python 3.12+
- `python-docx`
- Microsoft Word (voor interactieve form-controls via COM)
- `pywin32` (`win32com.client`)

## Standaardgebruik

```powershell
python scripts/generate_intake_form.py
```

Dit maakt:

- `output/Menyentuh_Intake_Anamnese.docx`

## CLI opties

```powershell
python scripts/generate_intake_form.py `
  --spec forms/intake_anamnese_spec.json `
  --out output/Menyentuh_Intake_Anamnese.docx `
  --logo assets/menyentuh-logo-720.png
```

Beschikbare flags:

- `--spec`: pad naar JSON specificatie.
- `--out`: pad van het gegenereerde `.docx`.
- `--logo`: overschrijft `branding.logo_path` uit de spec.
- `--validate-only`: valideert alleen de spec en stopt.
- `--no-com`: maakt een fallback `.docx` zonder echte Word controls.

## Validatie

```powershell
python scripts/generate_intake_form.py --validate-only
```

De validatie controleert onder andere:

- verplichte top-level keys (`metadata`, `branding`, `document_layout`, `sections`)
- verplichte veldkeys (`id`, `label`, `type`, `required`, `help_text`)
- toegestane veldtypes
- dubbele `id` waarden
- vereiste `options` voor `dropdown` en `checkbox_group`
- geldige brandingkleuren (hex)
- geldig logo-pad

## Interactieve velden

Zonder `--no-com` verrijkt de generator het basisdocument met Word content controls:

- `text_short` -> plain text control
- `text_long` -> rich text control
- `checkbox`/`checkbox_group` -> checkbox control
- `dropdown` -> dropdown list control
- `date` -> date picker control
- `signature_line` -> handtekeninglijn

## Foutafhandeling

Voorbeelden:

- Ontbrekend logo-pad -> duidelijke foutmelding met gecontroleerde paden.
- Ongeldige spec -> foutmelding met exacte locatie.
- COM niet beschikbaar -> melding om `pywin32`/Word te gebruiken of `--no-com` te kiezen.
