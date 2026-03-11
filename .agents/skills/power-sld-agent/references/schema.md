# Django-Aligned Output Schema (Authoritative)

The JSON produced will be mapped one-to-one into Django models linked to a Substation model.

## Mandatory Output Rules
1. **Valid JSON ONLY**: No explanations, comments, or markdown.
2. **snake_case**: Use snake_case for all field names.
3. **Relational Structure**: Child objects reference parents implicitly via structure (no circular refs).
4. **Minimalism**: If a value cannot be inferred with high confidence, omit the field (don't set to null).
5. **Data Types**:
    - Dates: `YYYY-MM-DD`
    - Voltages/Sequence Numbers: `integers`
    - Identifiers: Unique within substation scope.

## Authoritative Structure
```json
{
  "substation_id": "string",
  "commissioning_date": "YYYY-MM-DD",
  "transformers": [
    {
      "transformer_id": "string",
      "transformer_type": "string",
      "sequence_number": 1,
      "hv_voltage": 132,
      "lv_voltage": 33,
      "commission_date": "YYYY-MM-DD",
      "hv_breaker_number": "string",
      "lv_breaker_number": "string"
    }
  ],
  "incoming_bays": [
    {
      "bay_id": "string",
      "feeder_name": "string",
      "voltage": 132,
      "breaker_number": "string",
      "sequence_number": 1
    }
  ]
}
```

## Relational Mapping
- **Substation** (Parent)
- **Transformer** (Child of Substation)
- **IncomingBay** (Child of Substation)
- **Breaker** (Embedded or separate model as defined by backend)
    - *Note: Foreign keys are implicit via JSON hierarchy.*
