# OpenAPI outline template

## Error envelope

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable",
    "details": {}
  }
}
```

## Endpoints

### METHOD /path

- Auth: none | user | role:admin
- Request:
- Response 200:
- Errors:
- Notes: pagination / idempotency / rate
