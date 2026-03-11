# Authoritative Rule Set for SLD Interpretation

## Instruction No.12 (Mandatory Context)
Instruction No.12 refers to the official Grid System Operator standard for HV Equipment Naming, Numbering, and Nomenclature. It is authoritative and overrides all geometric or visual assumptions. If a geometric inference conflicts with Instruction No.12 rules, the rules MUST prevail.

It defines mandatory rules for:
- Transformer naming (T#, SGT#, XGT#, etc.)
- HV and LV switchgear numbering
- Function numbers (CB, isolator, earthing switch, fault thrower)
- Voltage-specific numbering formats
- One-and-a-half breaker schemes

## 1. Voltage Identification (Color Code — Highest Priority)
- **Black**   → 500 kV
- **Cyan**    → 275 kV
- **Green**   → 132 kV
- **Red**     → 33 kV
- **Purple**  → 22 kV
- **Yellow**  → 11 kV
- If color and position conflict, color wins.

## 2. Transformer Identification & Naming
Transformers identified using: `[winding ratio] [identification][sequence number]`

### Valid Identifications:
- **XGT#** → 500/275 kV Extra Grid Transformer
- **SGT#** → 275/132(/11) kV Super Grid Transformer
- **T#**   → 132 kV Load Transformer
- **GT#**  → Generator Transformer
- **ST#**  → Station Transformer
- **ET#**  → Earthing Transformer

### Rules:
- Sequence number defines identity.
- Banked transformers share number with suffix (T1A, T1B).
- Naming rules override physical location.

## 3. HV Switchgear Numbering (Instruction No.12)
**132 kV Switchgear**: Exactly 3 numeric characters (Format: ABC)
- **A**: sequence number
- **B**: switch group
- **C**: function number

**Function Numbers**:
- **0 / 5** → Circuit Breaker
- **1** → Earthing Switch
- **9** → Fault Thrower
- *(Other functions follow regional/Instruction No.12 conventions)*

## 4. LV Switchgear (Transformer Incomers)
- **33 kV / 22 kV**: Alphanumeric, 3 characters (e.g., 3T0, 4T0)
- **11 kV**: Numeric, 2 characters (e.g., 31, 32)
- Voltage level must be confirmed using color code.

## 5. Incoming Bay Identification
- Identified by: Feeder name (e.g. SRDN1, IOIM2), Voltage level, and associated circuit breaker.
- Breaker association must follow numbering rules, not proximity.
- NEVER assume vertical alignment implies hierarchy or connectivity.
