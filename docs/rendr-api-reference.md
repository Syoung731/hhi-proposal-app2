# Rendr API v3 Reference

Base URL: `https://app.rendr.com`

## Authentication
- OAuth2 Client Credentials flow
- Token endpoint: `POST /o/token/`
- Authorization: `Basic {base64(clientId:clientSecret)}`
- Body: `grant_type=client_credentials`
- Token `expires_in`: 36000 seconds (10 hours)
- All API calls require `Authorization: Bearer {token}` header

## Pagination
All list endpoints use this pagination structure:
```json
{
  "items": [...],
  "pagination": {
    "total_records": 56,
    "per_page": 10,
    "current_page": 1,
    "prev_page": null,
    "next_page": 2,
    "total_pages": 6
  }
}
```
Query params: `page` (default 1), `page_size` (default 10)

---

## Projects

### List Projects
`GET /api/v3/projects/?page=1&page_size=10`

Response item shape:
```json
{
  "id": "string",          // NOTE: string, not integer
  "name": "string",
  "description": "string",
  "spaces": [SpaceOut],    // embedded, not separate endpoint
  "created": "ISO datetime",
  "owner": "string"
}
```

### Get Project
`GET /api/v3/projects/{project_id}/`
- `project_id`: integer in URL path
- Returns same shape as list item

### Create Project
`POST /api/v3/projects/`
Body: `{ "name": "string", "description": "string", "space_ids": ["string"] }`

### Update Project
`PUT /api/v3/projects/{project_id}/`
Body: `{ "name": "string", "description": "string" }`

### Delete Project
`DELETE /api/v3/projects/{project_id}/`

### Update Project Spaces
`PUT /api/v3/projects/{project_id}/spaces/`
Body: `["space_id_1", "space_id_2"]`

### Delete Project Spaces
`DELETE /api/v3/projects/{project_id}/spaces/`
Body: `["space_id_1"]`

---

## Spaces

### List Spaces
`GET /api/v3/spaces/?page=1&page_size=10`

### Get Space
`GET /api/v3/spaces/{space_id}/?show_json=false`
- `space_id`: integer ID from API, NOT space_external_id

Space response shape:
```json
{
  "id": 0,                    // integer
  "created": "ISO datetime",
  "modified": "ISO datetime",
  "title": "string",          // NOTE: "title" not "name"
  "space_external_id": "string",
  "deleted": false,
  "notes": "string",
  "file_id": "string",
  "file_version": "string",
  "saved_date": "ISO datetime",
  "field_notes": "string",
  "field_notes_updated": "ISO datetime",
  "flex_file_uuid": "uuid",
  "flex_file_version": 0,
  "space_file_url": "string",
  "invite_id": "string",
  "user_external_id": "string",
  "photos": [PhotoOut]
}
```

### Create Space
`POST /api/v3/spaces/`
Body: `{ "space_external_id", "file_id", "file_version", "saved_date", "imported", "notes", "title", "invite_id" }`

### Update Space
`PUT /api/v3/spaces/{space_id}/`
Body: `{ "saved_date", "title", "notes", "deleted", "invite_id" }`

### Delete Space
`DELETE /api/v3/spaces/{space_id}/`

### Check Availability
`GET /api/v3/spaces/availability/`
Returns: `{ "available_spaces": 0 }`

### Upload File to Space
`POST /api/v3/spaces/{space_id}/file/`
Content-Type: multipart/form-data
Fields: `file` (required), `json_file`, `captured_space_file`, `invite_data`

### Upload Photo to Space
`POST /api/v3/spaces/{space_id}/photo/`
Content-Type: multipart/form-data
Fields: `file` (required), `invite_data`
Max 12 photos per space

### Delete Photo
`DELETE /api/v3/spaces/{space_id}/photos/`
Body: `[{ "photo_id": "string" }]`

---

## Space Data Endpoints

### Get JSON Data
`GET /api/v3/spaces/json/{space_id}/`
Returns raw JSON scan data

### Get JSON Blob
`GET /api/v3/spaces/json/data/{space_id}/`
Returns: `{ "field_notes", "field_notes_updated", "flex_file_uuid", "flex_file_version", "space": {} }`

### Get TakeOff Data (PRIMARY DATA ENDPOINT)
`GET /api/v3/spaces/take/off/data/{space_id}/`

Response:
```json
{
  "flex_file_uuid": "uuid",
  "flex_file_version": 0,
  "space": {
    "spaceTakeoff": { SpaceTakeOff },
    "rooms": [
      {
        "roomTakeoff": { RoomTakeOff },
        "label": "string"
      }
    ]
  }
}
```

### Export PDF Floor Plan
`GET /api/v3/spaces/pdf/{space_id}/`
Query params:
- `showWallLabels` (default: true)
- `showShortWallLabels` (default: false)
- `showFeatureLabels` (default: true)
- `showFixtures` (default: true)
- `showObjects` (default: true)

### Export XML
`GET /api/v3/spaces/xml/{space_id}/`

### Get Field Notes
`GET /api/v3/spaces/field/notes/{space_id}/`
Returns: `{ "id", "field_notes_updated", "flex_file_uuid", "flex_file_version", "field_notes_url" }`

---

## TakeOff Data Schema (ALL fields)

Both SpaceTakeOff and RoomTakeOff share these fields:

### Area measurements (square meters)
- `areaInSqMeters` - Floor area
- `wallsAreaInSqMeters` - Total wall area
- `ceilingAreaInSqMeters` - Ceiling area
- `totalPaintableSurfaceAreaInSqMeters` - Paintable surface area
- `windowsAreaInSqMeters` - Total windows area
- `doorsAreaInSqMeters` - Total doors area
- `openingsAreaInSqMeters` - Openings area
- `exteriorAreaInSqMeters` - Exterior area
- `countertopsAreaInSqMeters` - Countertop area
- `backsplashAreaInSqMeters` - Backsplash area

### Linear measurements (meters)
- `perimeterInMeters` - Room perimeter
- `exteriorPerimeterInMeters` - Exterior perimeter
- `baseCabinetsLengthInMeters` - Base cabinet run length
- `wallCabinetsLengthInMeters` - Wall cabinet run length
- `countertopsLengthInMeters` - Countertop run length
- `backsplashLengthInMeters` - Backsplash run length
- `storageObjectsLengthInMeters` - Storage objects length

### Counts
- `numberOfWindows`
- `numberOfDoors`
- `numberOfOpenings`
- `numberOfWalls`
- `numberOfRooms` (space-level only typically)
- `numberOfSinks`
- `numberOfToilets`
- `numberOfBathtubs`
- `numberOfBaseCabinets`
- `numberOfWallCabinets`
- `numberOfCountertops`
- `numberOfFirePlaces`
- `numberOfStairs`
- `numberOfBeds`
- `numberOfSofas`
- `numberOfChairs`
- `numberOfTables`
- `numberOfOvens`
- `numberOfStoves`
- `numberOfRefrigerators`
- `numberOfDishwashers`
- `numberOfWasherDryer`
- `numberOfTelevisions`
- `numberOfStorageObjects`
- `numberOfObjects`

### Other
- `description` - Room/space description string

---

## Invites (Invite to Capture)

### Create Invite
`POST /api/v3/invites/create/itc/`
Body:
```json
{
  "email": "string",
  "first_name": "string",
  "last_name": "string",
  "phone_number": "string",
  "address": "string",
  "message": "string",
  "project_id": 0,
  "show_quick_quotes": false,
  "do_not_send_email": true,
  "external_client_id": "string",
  "notify_url": "string"
}
```

---

## Rate Limiting
All endpoints may return `429 Too Many Requests`.

## Key Notes
- Project `id` is a **string** in responses (despite integer in URL path params)
- Space `id` is an **integer**
- Spaces use `title` field, NOT `name`
- Spaces are embedded in project list responses (no separate fetch needed for basic info)
- All measurements are in **metric** (meters, square meters) -- convert to imperial for US use
- The `space_id` in URLs is the integer ID from the API, NOT the `space_external_id`
- PDF endpoint streams the file -- requires auth header, proxy through server
