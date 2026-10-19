---
id: import-files
title: Fill forms from photos, PDFs and spreadsheets
section: tools
order: 40
summary: Read a paper sheet, printout, PDF or Excel/CSV file into any form, and import tables.
for: everyone
covers: option:import
related: ai-assistant, dyno, setup-sheets, setup-advisor
---
## Fill from photo, PDF or Excel (AI add-on)

On any form you can edit, the **AI** bar has **Fill from photo, PDF or Excel**.

1. Take or pick up to 6 photos, or choose a PDF, Excel (.xlsx) or CSV file. Examples: a paper setup sheet, a tyre-temperature card, a dyno printout or a spreadsheet of readings.
2. The AI lists what it found next to what's already there.
3. Untick anything wrong, then press **Apply**.

Only clearly readable values are filled in; nothing is guessed. Dyno tables go through the same importer as *Paste whole printout*, so each adjuster setting becomes its own curve.

On a shock dyno run, set **Adjustable** before you read the file. An adjustable shock fills **Adjuster settings tested**, one curve per setting. A non-adjustable shock fills the single **Readings** table.

A long scan, such as a 10-page dyno printout, can take a minute or two to read. Keep the page open while it says **Reading…**. If the file has more readings than can be read in one go, you'll be asked to split it. A PDF of two or three settings at a time works well.

## Import a table without AI

Tables (dyno readings, gear charts…) have **Paste / import**:

- **Paste** straight from a spreadsheet or printout. A header row such as `Speed CC RO RC CO` maps the columns; otherwise columns go in the order shown.
- **Load Excel / CSV file** reads .xlsx, .csv or .tsv. If the file has several sheets, pick one.

Check the text, then press **Replace** or **Add to existing**. Old .xls files need re-saving as .xlsx first. Files over 5 MB are refused.

## Tuning guides

On the Tuning guides page, **Import a guide from PDF, photo or Excel** turns a chassis guide into rules you check before saving. See [Setup advisor](/help/setup-advisor).
