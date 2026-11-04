# LIBRARY MODULE: file-upload

## Назначение

Загрузка файлов (Multer stream), обработка изображений (Sharp: resize/webp/thumbnail/avatar), метаданные в БД, абстракция storage Local/S3.

## Когда использовать

- Аватары, вложения чата, галереи, документы пользователя.

## Когда не использовать

- Только внешние CDN URL без своего upload.
- Очень большие видео/объекты (>сотни MB) — нужен multipart/direct-to-S3 (отдельный ADR), не классический Multer в память/диск API.

## Зависимости

- `auth-jwt` для владельца файла.
- Опционально: `rate-limiting` на `/api/upload`, `admin-panel` для модерации.

## Улучшения

- MIME: проверять **magic bytes** (file-type), не только `Content-Type` заголовка.
- EXIF strip обязателен для изображений.
- Отдача файла: не публичная папка без auth; signed URL или auth middleware.
- Virus scan (ClamAV) — optional GATE.
- Имена на диске: только `uuid` + safe ext whitelist; оригинал имени — только в БД.
- Транзакция: запись File в БД после успешного storage; при fail — компенсирующее delete.

---

## 1. Env

`UPLOAD_DIR`, `MAX_FILE_SIZE`, `ALLOWED_MIME_TYPES`, `THUMBNAIL_WIDTH/HEIGHT`, `AVATAR_SIZE`, `FILE_STORAGE_TYPE` (`local`|`s3`), `S3_*`, `UPLOAD_MAX_FILES` (default 10).

## 2. Модель File

`id`, `userId`, `originalName`, `fileKey`, `mimeType`, `size`, `path`, `thumbnailPath?`, `avatarPath?`, `width?`, `height?`, `metadata` JSONB, `createdAt`, soft `deletedAt?`.

## 3. StorageAdapter

```ts
interface StorageAdapter {
  put(key: string, body: NodeJS.ReadableStream | Buffer, meta: { mime: string }): Promise<{ key: string; path: string }>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  signUrl?(key: string, ttlSec: number): Promise<string>;
}
```

Implementations: `LocalStorageAdapter`, `S3StorageAdapter` (AWS/MinIO).

## 4. Image pipeline (Sharp)

| Профиль | Поведение | Ключ |
|---------|-----------|------|
| original | max edge resize, quality 80–90, optional webp | `{uuid}.ext` |
| thumbnail | cover center `TW×TH`, q≈70 | `thumb_{uuid}.ext` |
| avatar | cover square `AVATAR_SIZE`, webp | `avatar_{uuid}.webp` |

## 5. API

- `POST /api/upload` — single (auth)
- `POST /api/upload/multiple` — ≤ MAX_FILES
- `POST /api/upload/avatar` — avatar pipeline + обновить User.avatarFileId
- `GET /api/files/:id` | `/thumbnail` | `/avatar` — authz: owner | public-if-flag | admin
- `DELETE /api/files/:id` — owner/admin; удалить все производные

## 6. Frontend

- `FileUpload` (react-dropzone): progress, preview, errors
- Avatar: crop (react-easy-crop) → upload `/avatar`
- Не читать файл как base64 в Redux; только preview URL + revokeObjectURL

## 7. Security

- Path traversal запрещён (resolve + startsWith upload root).
- Rate limit uploads.
- AuthZ на GET/DELETE.
- Whitelist MIME + magic bytes.
- Strip EXIF.

## 8. Структура

```text
backend/src/files/{routes,controller,service,storage/{local,s3},image-pipeline,schemas}
frontend/src/components/FileUpload/
```

## 9. Тесты

- [ ] Reject oversized / bad mime / spoofed extension
- [ ] Avatar square + webp path set
- [ ] Delete removes derivatives
- [ ] Non-owner GET → 403
- [ ] Local adapter path traversal attempt fails

## 10. Антипаттерны

- Раздача `/uploads` static без проверки прав
- Доверие только `mimetype` от клиента
- Хранение абсолютных путей OS в публичном API
- Обработка Sharp в request без лимита concurrency (DoS)

## 11. Критерии готовности

Adapter + Multer limits + Sharp profiles + File model + authz + FE upload/avatar + rate limit + тесты.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `auth-jwt` | Владелец файла | `userId` из auth; GET/DELETE с authz |
| `rate-limiting` | DoS через upload | Жёсткий tier `route.upload` |
| `admin-panel` | Модерация/удаление | Admin permission на delete чужих файлов |
| `websocket-socketio` | Не стримить файл в socket | См. websocket CONFLICTS |
| `caching-redis` | Кеш URL | Короткий TTL на signed URL metadata, не на бинарник в Redis |
