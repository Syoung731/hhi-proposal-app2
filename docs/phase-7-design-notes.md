================================================================
PHASE 7 PRE-BUILD INVESTIGATION REPORT
Generated: 2026-04-15
================================================================

--- AREA 1: SECTIONS TAB ---

File paths:
  - app/admin/projects/[id]/rooms/rooms-tab.tsx          (116KB — main Sections UI)
  - app/admin/projects/[id]/rooms/actions.ts              (58KB — server actions)
  - app/admin/projects/[id]/rooms/new-room-types-modal.tsx (assign room types)
  - app/admin/projects/[id]/rooms/ai-estimate-panel.tsx   (35KB — AI estimation panel)
  - app/admin/projects/[id]/rooms/bulk-ai-estimate-modal.tsx (14KB — bulk estimation)
  - app/admin/projects/[id]/rooms/bulk-review-and-estimate-modal.tsx (38KB — review+estimate)
  - app/admin/projects/[id]/rooms/scope-review-modal.tsx  (scope review)
  - app/lib/ai/extract-from-transcript.ts                 (transcript extraction AI)
  - app/lib/dimensions.ts                                 (dimension parsing utility)
  - app/lib/room-utils.ts                                 (room name normalization)

Generate Sections from Transcript flow:
  1. Button: rooms-tab.tsx lines 1330-1337, text "Generate sections from transcript"
  2. Handler: handleGenerateFromTranscript() at lines 1166-1186
  3. Calls server action: generateRoomsFromTranscriptAction(projectId) in actions.ts lines 619-801
  4. Server action fetches project transcript text, then calls:
     extractRoomsFromTranscript(transcriptText, stylePresetPrompt?) in extract-from-transcript.ts lines 153-226
  5. Returns: { created: number; skipped: number; error?: string; unmatchedRooms?: UnmatchedRoomItem[] }

  AI Model: callClaude() with max_tokens: 8192, temperature: 0.2

  SYSTEM PROMPT (extract-from-transcript.ts lines 157-189):
  """
  You are an expert residential remodeler writing proposal scope-of-work sections.

  Read the transcript and extract section-by-section scope.

  Return ONLY valid JSON. Prefer this shape (sections):
  { "sections": [ { "title": "...", "sectionTypeName": "Kitchen" or "Bathroom" etc (optional),
    "scopeNarrative": "...", "length": null, "width": null, "ceilingHeight": null,
    "lengthIn": null, "widthIn": null, "ceilingHeightIn": null } ] }

  Alternatively you may return (backward compatible):
  { "rooms": [ { "name": "...", "scopeNarrative": "...", "length": null, "width": null,
    "ceilingHeight": null, "lengthIn": null, "widthIn": null, "ceilingHeightIn": null } ] }

  Optional dimension fields (omit or set null when unknown). You may use EITHER string or numeric:
  - length: string (e.g. "12'6\"", "12 ft 6 in", "150 in") or null
  - width: string or null
  - ceilingHeight: string or null
  - lengthIn: total inches (integer), or null
  - widthIn: total inches (integer), or null
  - ceilingHeightIn: total inches (integer), or null

  Extract dimensions only when clearly stated and tied to that section. Examples:
  - "12 by 14" or "12x14" -> lengthIn 144, widthIn 168
  - "10x12" -> lengthIn 120, widthIn 144
  - "Ceilings 9 feet" -> ceilingHeightIn 108
  - Do NOT guess or hallucinate dimensions.

  Rules:
  - Sections/spaces can be any name used in remodeling proposals (Title Case).
  - Combine repeated mentions of the same space into one entry.
  - scopeNarrative must be ONE paragraph per section, professional, clear to homeowner.
  - No bullet points, no numbering.
  - Exclude general discussion not tied to a specific section.
  - If transcript has no section-specific scope, return { "sections": [] }.
  - Do not create sections like "General", "Overview", "Project", "Walkthrough", etc.
  - Output JSON only, no extra text.
  """

  DATA IN: transcript text + optional style preset prompt
  DATA OUT: { sections: [{ title, sectionTypeName?, scopeNarrative, length?, width?,
              ceilingHeight?, lengthIn?, widthIn?, ceilingHeightIn? }] }

Room creation code (actions.ts lines 729-744):
  {
    projectId,
    name: displayNameForCanonical(canonicalName),
    scopeNarrative: scopeNarrative.trim(),
    scopeSource: "AI",
    scopeUpdatedAt: new Date(),
    sortOrder: nextOrder++,
    roomTypeId: roomTypeId ?? null,
    sectionTypeId: sectionTypeId ?? null,
    lengthIn: lengthIn ?? null,
    widthIn: widthIn ?? null,
    ceilingHeightIn: ceilingHeightIn ?? null,
    areaSqFt: calculatedArea ?? null,
    origin: "AI_TRANSCRIPT"
  }

  Area calculation (lines 697-700):
    if (lengthIn && widthIn) {
      calculatedArea = (lengthIn / 12) * (widthIn / 12);  // inches -> sq ft
    }

Dimension extraction:
  Part of the SAME AI call. The AI prompt asks for dimensions alongside scope.
  Post-processing uses parseDimToInches() from app/lib/dimensions.ts to normalize:
    const lengthIn = parseDimToInches(item.lengthIn) ?? parseDimToInches(item.length) ?? null;
    const widthIn = parseDimToInches(item.widthIn) ?? parseDimToInches(item.width) ?? null;
    const ceilingHeightIn = parseDimToInches(item.ceilingHeightIn) ?? parseDimToInches(item.ceilingHeight) ?? null;

  parseDimToInches() accepts:
    - Numeric inches (0-2000)
    - Strings: "12' 6\"", "12'6\"", "12 ft 6 in", "12ft", "150 in", "9'"
    - Returns: number (total inches) | null

Scope narrative:
  Field: Room.scopeNarrative (String, default "")
  Format: Plain text, single paragraph (no bullets, no numbering per AI prompt rules)
  Related fields:
    - scopeSource: "AI" | "MANUAL"
    - scopeUpdatedAt: DateTime
    - scopeQA: Json (nullable) — stores Q&A data for scope clarification

Room type detection:
  Two separate type systems matched by normalized room name:

  A) RoomType — for per-SF pricing
     getRoomTypeNormalizedMap() builds Map<normalizedName, id>
     Matched against RoomType.name in DB

  B) SectionType — for pricing profile configuration
     getSectionTypeNormalizedMap() builds Map<normalizedName, id>
     Matched against SectionType.name in DB

  Normalization pipeline:
    1. normalizeRoomNameForCompare(rawName) — lowercase, remove punct
    2. applyAlias(name, transcriptText) — conservative alias mapping:
       "master bath" -> "primary bath"
       "master bathroom" -> "primary bath"
       "foyer" -> "entry/hall"
       "screen porch" -> "screened porch"
       etc.
    3. displayNameForCanonical(canonical) — Title Case for display
    4. normalizeRoomName(displayName) — final normalize for DB lookup

  Unmatched rooms returned to UI for manual type assignment via NewRoomTypesModal.

Room Prisma model (complete):
  See AREA 5 below for full definition.


--- AREA 2: RENDR DATA ON ROOMS ---

Rendr fields on Project model (prisma/schema.prisma lines 76-80):
  rendrSpaceId             Int?        // Rendr space ID linked to this project
  rendrProjectId           Int?        // Rendr project ID (optional)
  rendrLinkedAt            DateTime?   // When Rendr scan was linked
  rendrImportedAt          DateTime?   // When measurements were last imported

Rendr fields on Room model:
  NONE DEDICATED. Rendr data is stored in EXISTING Room fields:
  - areaSqFt (Float?) — receives LiDAR floor area
  - measurementMode (MeasurementMode?) — set to "AREA" on import
  - pricingNotes (String?) — receives multi-line Rendr metadata text

Rendr import flow (app/admin/projects/[id]/rendr/rendr-actions.ts lines 39-97):
  importRendrMeasurements(appProjectId, mappings[]):

  For EACH mapped room:
    1. Fetches takeoff data from /api/rendr/spaces/{spaceId}/takeoff
    2. Gets the room by index: takeoff.rooms[mapping.rendrRoomIndex]
    3. Updates Room record:

       await prisma.room.update({
         where: { id: mapping.appRoomId },
         data: {
           areaSqFt: t.floorSF,
           measurementMode: "AREA",
           pricingNotes: [
             `LiDAR Import: Floor ${t.floorSF} SF, Walls ${t.wallsSF} SF, Ceiling ${t.ceilingSF} SF`,
             `Perimeter ${t.perimeterLF} LF, Paintable ${t.paintableSF} SF`,
             t.numberOfWindows ? `Windows: ${t.numberOfWindows} (${t.windowsSF} SF)` : null,
             t.numberOfDoors ? `Doors: ${t.numberOfDoors} (${t.doorsSF} SF)` : null,
             t.numberOfSinks ? `Sinks: ${t.numberOfSinks}` : null,
             t.numberOfToilets ? `Toilets: ${t.numberOfToilets}` : null,
             t.numberOfBathtubs ? `Bathtubs: ${t.numberOfBathtubs}` : null,
             t.baseCabinetsLF ? `Base Cabinets: ${t.numberOfBaseCabinets} (${t.baseCabinetsLF} LF)` : null,
             t.wallCabinetsLF ? `Wall Cabinets: ${t.numberOfWallCabinets} (${t.wallCabinetsLF} LF)` : null,
             t.countertopsLF ? `Countertops: ${t.countertopsLF} LF (${t.countertopsSF} SF)` : null,
             t.backsplashLF ? `Backsplash: ${t.backsplashLF} LF (${t.backsplashSF} SF)` : null,
             t.numberOfFirePlaces ? `Fireplaces: ${t.numberOfFirePlaces}` : null,
           ].filter(Boolean).join("\n"),
         },
       });

    4. After all rooms: sets Project.rendrImportedAt = new Date()

  KEY OBSERVATION: Rich Rendr data (walls SF, ceiling SF, perimeter LF, fixture counts,
  cabinet LF, countertop SF, backsplash SF) is FLATTENED into a text string in pricingNotes.
  Only areaSqFt (floor area) is stored in a proper typed field.

Room matching (app/lib/rendr/roomMatcher.ts):
  Two-stage process:
    Stage 1 — Fuzzy matching: score all Rendr×App room pairs using combined
      tokenOverlap + levenshtein similarity. Threshold: 0.6 for candidate, 0.8 for high.
      Substitutions: master->primary, br/bd->bedroom, ba/bath->bathroom, etc.

    Stage 2 — AI matching: unmatched rooms sent to /api/rendr/match-rooms (Claude Sonnet)
      Returns: [{ rendrLabel, appRoomName, confidence }]

    UI: rendr-matching-table.tsx shows matches, allows manual override, then calls
    importRendrMeasurements() on confirm.

Rendr data format — ImperialRoomTakeoff (app/lib/rendr/types.ts):
  Area measurements (SF): floorSF, wallsSF, ceilingSF, paintableSF, windowsSF,
    doorsSF, openingsSF, exteriorSF, countertopsSF, backsplashSF
  Linear measurements (LF): perimeterLF, exteriorPerimeterLF, baseCabinetsLF,
    wallCabinetsLF, countertopsLF, backsplashLF, storageObjectsLF
  Counts: numberOfWindows, numberOfDoors, numberOfOpenings, numberOfWalls,
    numberOfRooms, numberOfSinks, numberOfToilets, numberOfBathtubs,
    numberOfBaseCabinets, numberOfWallCabinets, numberOfCountertops,
    numberOfFirePlaces, numberOfStairs, numberOfOvens, numberOfStoves,
    numberOfRefrigerators, numberOfDishwashers, numberOfWasherDryer, etc.

Link tracking:
  Project level: rendrSpaceId non-null = scan is linked
  Project level: rendrImportedAt non-null = measurements have been imported
  Room level: NO direct Rendr ID field. Detection via:
    - measurementMode == "AREA" AND pricingNotes starts with "LiDAR Import:"
    - origin field NOT set to "IMPORTED" during Rendr flow (it stays whatever it was)

  Linking code (rendr-actions.ts lines 7-23):
    linkRendrProject(appProjectId, rendrProjectId, rendrSpaceId)
    unlinkRendrProject(appProjectId) — clears all 4 Rendr fields

Rendr-related Prisma fields summary:
  Project: rendrSpaceId, rendrProjectId, rendrLinkedAt, rendrImportedAt
  Room: (none dedicated — uses areaSqFt, measurementMode, pricingNotes)
  IntegrationSetting: service, clientId, clientSecret, isActive, lastTestedAt, lastTestResult


--- AREA 3: ESTIMATE GENERATION PROMPT ---

File paths:
  - app/api/ai-estimate/route.ts                  (POST generates estimate, GET fetches latest)
  - app/api/ai-estimate/[estimateId]/regenerate/route.ts  (regenerate with updated scope)
  - app/api/ai-estimate/[estimateId]/accept/route.ts      (accept + write to room pricing)
  - app/lib/ai-estimate-prompt.ts                  (system prompt + user prompt builder)
  - app/lib/ai-estimate-parser.ts                  (JSON parser + fuzzy matching + validation)
  - app/lib/effective-room-sf.ts                   (dimension pre-calculation)
  - app/lib/fuzzy-catalog-match.ts                 (fuzzy name matching with material guard)

What goes into the prompt:
  1. Company Context: market, marketNotes, clientProfile, defaultFinishTier,
     standardInclusions, markupStructure, estimationAssumptions
  2. Project Context: propertyType, constructionEra, existingCondition,
     occupiedDuringWork, specialConditions
  3. Room Details:
     - Room type (from template displayName)
     - Square footage: effectiveSqFt (base + sub-areas)
     - Dimensions: lengthFt × widthFt (with inches precision)
     - Ceiling height: room-specific > project default > 9ft
     - Perimeter: effectivePerimeterLF (base + sub-area perimeters)
     - Wall area: effectivePerimeterLF × ceilingHeightFt
     - Ceiling area: same as floor area
     - PRE-CALCULATED VALUES block with exact numbers
  4. Scope QA: structured Q&A answers
  5. Scope of Work: scopeNarrative text
  6. Correction History: top 20 most-corrected fields from past estimates
  7. Room Template: trade groups with catalog items, prices, and $0 allowance markers

How dimensions are pre-calculated (app/lib/effective-room-sf.ts):
  getEffectiveRoomMetrics(room, subAreas, projectDefaultCeilingFt):

    const lengthFt = (room.lengthFt || 0) + (room.lengthIn || 0) / 12;
    const widthFt = (room.widthFt || 0) + (room.widthIn || 0) / 12;
    const baseSqFt = room.areaSqFt || (lengthFt * widthFt) || 0;
    const basePerimeterLF = lengthFt > 0 && widthFt > 0 ? 2 * (lengthFt + widthFt) : 0;

    // Sub-areas with includeInArea = true
    const subAreaSqFt = includedSubAreas.reduce((sum, sa) => sum + (sa.areaSqFt || 0), 0);
    const subAreaPerimeterLF = includedSubAreas.reduce((sum, sa) => {
      const saLengthFt = (sa.lengthIn || 0) / 12;
      const saWidthFt = (sa.widthIn || 0) / 12;
      return sum + (saLengthFt > 0 && saWidthFt > 0 ? 2 * (saLengthFt + saWidthFt) : 0);
    }, 0);

    const effectiveSqFt = baseSqFt + subAreaSqFt;
    const effectivePerimeterLF = basePerimeterLF + subAreaPerimeterLF;
    const ceilingHeightFt = roomCeilingFt > 0 ? roomCeilingFt : (projectDefaultCeilingFt || 9);
    const wallSF = effectivePerimeterLF > 0 ? effectivePerimeterLF * ceilingHeightFt : null;

  CRITICAL: When a room has areaSqFt set (e.g., from Rendr import) but no length/width,
  baseSqFt = areaSqFt (correct), BUT basePerimeterLF = 0 (no dimensions to compute from).
  This means wallSF = null for Rendr-imported rooms without explicit L×W dimensions.

What comes out:
  {
    "roomType": "Kitchen",
    "estimatedTotalPrice": 45000,
    "tradeGroups": [{
      "name": "Demo",
      "items": [{
        "name": "[DMO] Remove Flooring Hardwood",
        "catalogMatch": true,
        "source": "CATALOG" | "AI_PRICED" | "ALLOWANCE",
        "quantity": 150,
        "unit": "SF",
        "unitCost": 3.00,
        "unitPrice": 7.50,
        "totalPrice": 1125.00,
        "confidence": 0.95,
        "notes": "Scope says full gut. Floor area = 150 SF..."
      }]
    }]
  }

Kitchen/Bath specifics in estimate prompt:
  - Allowance price ranges: Kitchen faucet $400-600, Bathroom faucet $250-450, Toilet $400-700
  - Shower tile calculation rules (3-wall formula)
  - Countertop special rule (material + install pairing required)
  - NO branching logic — all rooms use the same system prompt
  - Differentiation via template catalog items (Kitchen template has different items than Bath)

FULL SYSTEM PROMPT: (see ai-estimate-prompt.ts lines 31-170)
  [Extremely long — covers: RULES (JSON only, catalog matching, source tagging,
  allowance pricing, quantities, confidence scores), JUSTIFICATION REQUIRED,
  UNMATCHED MATERIAL ITEMS, SCOPE DISCIPLINE, PROJECT OVERHEAD EXCLUSION,
  QUANTITY CALCULATION RULES (mandatory pre-calculated values usage),
  FLOOR TILE SPECIAL RULE, SHOWER TILE CALCULATIONS,
  MATERIAL AND INSTALLATION PAIRING (mandatory pairs), COUNTERTOP SPECIAL RULE,
  FRAMING AND STRUCTURAL ITEMS]

  Key rule: "The Room Details section contains PRE-CALCULATED values for floor area,
  wall area, ceiling area, total drywall, and perimeter. You MUST use these exact numbers."

FULL USER PROMPT: (see ai-estimate-prompt.ts lines 293-417)
  Sections: Company Context, Project Context, Room Details (with PRE-CALCULATED VALUES block),
  Clarifications (from scopeQA), Scope of Work (narrative), Correction History,
  Room Template Structure (trade groups + catalog items), Required JSON Output Format


--- AREA 4: COPE CALCULATION ---

File paths:
  - app/api/cope-estimate/route.ts         (POST generates COPE, GET fetches latest)
  - app/lib/cope-estimate-prompt.ts        (COPE system + user prompt)
  - app/lib/cope-aggregate-data.ts         (project aggregate data + pre-calculations)
  - app/lib/permit-fee-calculator.ts       (permit fee schedule logic)
  - app/lib/effective-room-sf.ts           (room-level SF calculations used by aggregate)
  - app/lib/ensure-cope-room.ts            (auto-creates COPE room for new projects)

What project-level measurements COPE uses:
  - totalAreaSqFt: sum of all room effective SF (base + included sub-areas)
  - totalEstimatedPrice: sum of latest AI estimates across all non-COPE rooms
  - totalEstimatedCost: sum of costs across all estimates
  - roomCount: number of non-COPE rooms
  - roomsWithEstimates: count of rooms with completed estimates
  - demoTotal: sum of Demo trade group pricing (for dumpster calculation)
  - tradeBreakdown: per-trade count, totalPrice, totalCost
  - hasFraming / hasPlumbing / hasElectrical / hasWindows: boolean scope flags
  - distinctTrades: count of unique trade groups
  - permitFees: pre-calculated object (baseFee, planReviewFee, required, reasons, calculation)

Where measurements come from:
  getProjectAggregateData() in cope-aggregate-data.ts:
    1. Fetches all non-COPE rooms with their dimensions
    2. For each room, computes effectiveSqFt via getEffectiveRoomMetrics()
    3. Sums effectiveSqFt across all rooms -> totalAreaSqFt
    4. Fetches latest AIEstimate per room, aggregates line items
    5. Determines scope flags from trade breakdown (e.g., "Framing" in trades -> hasFraming)
    6. Calls calculatePermitFee(totalEstimatedPrice, scopeFlags)

  So COPE reads room dimensions indirectly via getEffectiveRoomMetrics() which reads:
    Room.areaSqFt (or computes from lengthFt × widthFt)
    Room sub-areas with includeInArea = true
    Room ceiling height (or project default or 9ft)

Permit fee pre-calculation (app/lib/permit-fee-calculator.ts):
  Town of Hilton Head Island fee schedule:
    <= $1,000: $35
    $1,001-$2,000: $70
    $2,001-$3,000: $77
    $3,001-$50,000: $77 + $9 × ceil((value - 3000) / 1000)
    > $50,000: $500 + $3.50 × ceil((value - 50000) / 1000)

  Plan review: 50% of permit fee, required if hasFraming || hasPlumbing || hasWindows

  Returns: { baseFee, planReviewFee, planReviewRequired, planReviewReasons, totalPermitCost, calculation }

What would change if room dimensions became more accurate:
  YES — COPE automatically benefits because:
    1. totalAreaSqFt is recalculated each time from room effective SF
    2. Used for: Final Construction Cleaning (rate × SF), Floor/Content Protection (rate × SF)
    3. More accurate room SF -> more accurate total project area -> better COPE estimates
  HOWEVER:
    - Wall SF from Rendr is NOT flowing through. Currently stored only in pricingNotes text.
    - Perimeter from Rendr is NOT stored in a typed field, so wall area calculations
      for rooms with only areaSqFt (no L×W) will have wallSF = null.
    - COPE itself doesn't use wall SF directly, but room estimates DO, and COPE
      aggregates room estimate totals. So indirectly, better wall data improves COPE.

COPE SYSTEM PROMPT: (see cope-estimate-prompt.ts)
  [Very long — covers: RULES (JSON only, catalog prices, math in notes),
  SKIP ITEMS (no Final Construction Drawings), PERMIT FEES (pre-calculated, exact numbers),
  HOA FEES ($200-$500 per scope), WASTE REMOVAL (1 dumpster per 250 SF demo),
  FINAL CONSTRUCTION CLEANING (total project SF × rate),
  ON SITE SUPERVISION (duration estimation by project value),
  CONTENT MANIPULATION (default 0, triggered by living-space guts),
  FLOOR AND CONTENT PROTECTION (total project SF × rate),
  TAG EVERY ITEM, CONFIDENCE SCORES]

COPE USER PROMPT BUILDER (buildCopeUserPrompt):
  Sections: Company Context, Project Aggregate Data, Room Summary (per-room name + SF + price),
  Trade Summary (sorted by price descending), Pre-Calculated Permit Fees (exact numbers),
  Scope Characteristics (boolean flags), COPE Template Catalog Items


--- AREA 5: ROOM MODEL COMPLETE PICTURE ---

Complete Room model (prisma/schema.prisma lines 145-209):

  model Room {
    id                        String            @id @default(cuid())
    projectId                 String
    roomTypeId                String?
    stylePresetId             String?
    sectionTypeId             String?
    estPricePerSqFt           Float?
    lengthFt                  Float?
    widthFt                   Float?
    ceilingHeightFt           Float?
    lengthIn                  Int?
    widthIn                   Int?
    ceilingHeightIn           Int?
    scopeNarrative            String            @default("")
    sortOrder                 Int               @default(0)
    createdAt                 DateTime          @default(now())
    updatedAt                 DateTime          @updatedAt
    name                      String
    scopeSource               String            @default("AI")
    scopeUpdatedAt            DateTime          @default(now())
    selectedRenderMediaId     String?
    measurementMode           MeasurementMode?
    areaSqFt                  Float?
    quantity                  Int?
    origin                    SectionOrigin     @default(MANUAL)
    estimateUnit              EstimateUnit?
    customUnitLabel           String?
    unitRate                  Float?
    unitQuantity              Float?
    unitQuantityManualOverride Boolean          @default(false)
    roomTemplateId            String?
    pricingTier               RoomPricingTier   @default(PROFILE)
    isProjectOverhead         Boolean           @default(false)
    unitRateLow               Float?
    unitRateTarget            Float?
    unitRateHigh              Float?
    totalLow                  Float?
    totalTarget               Float?
    totalHigh                 Float?
    pricingNotes              String?
    scopeQA                   Json?
    estimateStaleReason       String?
    bucket                    SectionBucket     @default(BASE)

    // Relations
    media                     Media[]
    subAreas                  RoomSubArea[]
    project                   Project           @relation(...)
    roomType                  RoomType?         @relation(...)
    stylePreset               StylePreset?      @relation(...)
    sectionType               SectionType?      @relation(...)
    roomTemplate              RoomTemplate?     @relation(...)

    @@index([projectId])
    @@index([projectId, bucket])
    @@index([projectId, sortOrder])
    @@index([projectId, isProjectOverhead])
    @@index([roomTypeId])
    @@index([stylePresetId])
    @@index([sectionTypeId])
    @@index([origin])
    @@index([estimateUnit])
    @@index([roomTemplateId])
  }

  model RoomSubArea {
    id              String    @id @default(cuid())
    roomId          String
    name            String
    lengthIn        Int?
    widthIn         Int?
    ceilingHeightIn Int?
    areaSqFt        Float?
    sortOrder       Int       @default(0)
    includeInArea   Boolean   @default(true)
    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt
    room            Room      @relation(...)
    @@index([roomId, sortOrder])
  }

Enums:
  MeasurementMode: NONE, DIMENSIONS, AREA, COUNT
  SectionOrigin: MANUAL, AI_TRANSCRIPT, TEMPLATE, IMPORTED
  EstimateUnit: SQFT, LF, EA, LUMP, CUSTOM
  RoomPricingTier: PROFILE, AI_ESTIMATE, MANUAL
  SectionBucket: BASE, ALTERNATE, ALLOWANCE

Measurement/dimension fields:
  Room: lengthFt, widthFt, ceilingHeightFt, lengthIn, widthIn, ceilingHeightIn, areaSqFt
  RoomSubArea: lengthIn, widthIn, ceilingHeightIn, areaSqFt

Data source/origin fields:
  Room.origin: MANUAL | AI_TRANSCRIPT | TEMPLATE | IMPORTED
  Room.scopeSource: "AI" | "MANUAL"
  Room.scopeUpdatedAt: DateTime
  Room.measurementMode: indicates how area was captured

JSON fields:
  Room.scopeQA (Json?):
    Structure: { questions?: [{ question: string, answer: unknown, unit?: string }] }
    Also stores: renderChecklist (cached visual checklist items)
    Used by: AI estimate prompt building, scope review modal

Does NOT exist:
  - roomDetail: NO
  - detail: NO
  - fixtures: NO
  - measurementSource: NO
  - Any dedicated Rendr field on Room: NO


--- AREA 6: KITCHEN/BATH CURRENT HANDLING ---

1. Room classification logic (app/admin/projects/[id]/overview/generate-overview-action.ts):
   function classifyRoomCategory(name):
     name.includes("kitchen") -> "kitchen"
     name.includes("bath") || "powder" || "ensuite" -> "bath"
     name.includes("laundry") || "mud" -> "laundry"
     ... etc.
   Used for project title generation ("Kitchen Remodel", "Bathroom Remodel", etc.)

2. Template auto-matching (bulk-ai-estimate-modal.tsx lines 29-45):
   function autoMatchTemplate(roomName, templates):
     keywords "kitchen" -> matches template "kitchen"
     keywords "bath", "bathroom" -> matches template "bath"
     keywords "laundry" -> matches template "laundry"
     keywords "closet" -> matches template "closet"
     keywords "cope", "admin" -> matches template "cope"

3. Sections UI rendering:
   NO Kitchen/Bath-specific rendering. All rooms rendered identically.
   No special templates, no fixture-specific displays, no room-type layout variants.

4. Estimate prompt Kitchen/Bath handling:
   - Allowance price ranges (examples in system prompt):
     Kitchen faucet: $400-600, Bathroom faucet: $250-450, Toilet: $400-700
     Appliance range: $2,500-5,000, Appliance refrigerator: $2,500-4,500
   - Shower tile calculation rules (3-wall formula, pan dimensions)
   - Countertop pairing rule (material + install required)
   - NO branching logic or Kitchen/Bath conditionals in prompts
   - Differentiation via template catalog items ONLY

5. Fixture-tracking fields:
   NO dedicated fields for sink count, cabinet LF, etc.
   Fixture data exists in:
   - scopeNarrative (free text mentions)
   - scopeQA (Q&A about fixtures)
   - pricingNotes (Rendr import text with fixture counts)

6. Transcript extraction and fixtures:
   AI prompt extracts: title, scopeNarrative, dimensions only
   NO explicit fixture count extraction from transcript
   Fixture details appear in scopeNarrative text (e.g., "Replace vanity, new fixtures")

7. Render checklist keywords (media-tab.tsx):
   CHANGE_ACTION_MAP recognizes: backsplash, countertop, vanity cabinet, sink,
   kitchen sink, light fixtures, cabinet, cabinets, etc.
   Used for rendering checklist generation, NOT for estimating

SUMMARY: Kitchen/Bath is handled primarily through:
  - Template selection (different catalog items per room type)
  - Name-based classification (for overview titles and template matching)
  - Scope narrative (free text describing fixture work)
  NO structured fixture data model exists.


--- AREA 7: CONVERSION UTILITIES ---

File: app/lib/rendr/conversions.ts (COMPLETE):

  const SQ_METERS_TO_SQ_FEET = 10.7639;
  const METERS_TO_FEET = 3.28084;

  /** Square meters -> square feet, rounded to 1 decimal place. */
  export function sqmToSqft(sqm: number): number {
    return Math.round(sqm * SQ_METERS_TO_SQ_FEET * 10) / 10;
  }

  /** Meters -> feet, rounded to 1 decimal place. */
  export function metersToFeet(m: number): number {
    return Math.round(m * METERS_TO_FEET * 10) / 10;
  }

  /** Meters -> linear feet, rounded to 1 decimal place. */
  export function metersToLF(m: number): number {
    return Math.round(m * METERS_TO_FEET * 10) / 10;
  }

Conversion functions available:
  1. sqmToSqft(sqm) — square meters to square feet
  2. metersToFeet(m) — meters to feet
  3. metersToLF(m) — meters to linear feet (same formula as metersToFeet)

Counter LF -> countertop SF conversion:
  NO explicit conversion function. Rendr provides BOTH:
  - countertopsLengthInMeters -> converted to countertopsLF
  - countertopsAreaInSqMeters -> converted to countertopsSF
  Both stored independently. No LF-to-SF derivation needed.

Backsplash LF -> backsplash SF conversion:
  NO explicit conversion function. Rendr provides BOTH:
  - backsplashLengthInMeters -> converted to backsplashLF
  - backsplashAreaInSqMeters -> converted to backsplashSF
  Both stored independently. No LF-to-SF derivation needed.

File: app/lib/rendr/convertTakeoff.ts (COMPLETE):
  function convertRoomTakeoff(raw: RendrRoomTakeoff): ImperialRoomTakeoff {
    return {
      // Area conversions (sqm -> SF)
      floorSF: sqmToSqft(n(raw.areaInSqMeters)),
      wallsSF: sqmToSqft(n(raw.wallsAreaInSqMeters)),
      ceilingSF: sqmToSqft(n(raw.ceilingAreaInSqMeters)),
      paintableSF: sqmToSqft(n(raw.totalPaintableSurfaceAreaInSqMeters)),
      windowsSF: sqmToSqft(n(raw.windowsAreaInSqMeters)),
      doorsSF: sqmToSqft(n(raw.doorsAreaInSqMeters)),
      openingsSF: sqmToSqft(n(raw.openingsAreaInSqMeters)),
      exteriorSF: sqmToSqft(n(raw.exteriorAreaInSqMeters)),
      countertopsSF: sqmToSqft(n(raw.countertopsAreaInSqMeters)),
      backsplashSF: sqmToSqft(n(raw.backsplashAreaInSqMeters)),
      // Linear conversions (m -> LF)
      perimeterLF: metersToLF(n(raw.perimeterInMeters)),
      exteriorPerimeterLF: metersToLF(n(raw.exteriorPerimeterInMeters)),
      baseCabinetsLF: metersToLF(n(raw.baseCabinetsLengthInMeters)),
      wallCabinetsLF: metersToLF(n(raw.wallCabinetsLengthInMeters)),
      countertopsLF: metersToLF(n(raw.countertopsLengthInMeters)),
      backsplashLF: metersToLF(n(raw.backsplashLengthInMeters)),
      storageObjectsLF: metersToLF(n(raw.storageObjectsLengthInMeters)),
      // Counts (unchanged)
      numberOfWindows: n(raw.numberOfWindows),
      numberOfDoors: n(raw.numberOfDoors),
      numberOfOpenings: n(raw.numberOfOpenings),
      numberOfWalls: n(raw.numberOfWalls),
      numberOfRooms: n(raw.numberOfRooms),
      numberOfSinks: n(raw.numberOfSinks),
      numberOfToilets: n(raw.numberOfToilets),
      numberOfBathtubs: n(raw.numberOfBathtubs),
      numberOfBaseCabinets: n(raw.numberOfBaseCabinets),
      numberOfWallCabinets: n(raw.numberOfWallCabinets),
      numberOfCountertops: n(raw.numberOfCountertops),
      numberOfFirePlaces: n(raw.numberOfFirePlaces),
      numberOfStairs: n(raw.numberOfStairs),
      numberOfOvens: n(raw.numberOfOvens),
      numberOfStoves: n(raw.numberOfStoves),
      numberOfRefrigerators: n(raw.numberOfRefrigerators),
      numberOfDishwashers: n(raw.numberOfDishwashers),
      numberOfWasherDryer: n(raw.numberOfWasherDryer),
      numberOfBeds: n(raw.numberOfBeds),
      numberOfSofas: n(raw.numberOfSofas),
      numberOfChairs: n(raw.numberOfChairs),
      numberOfTables: n(raw.numberOfTables),
      numberOfTelevisions: n(raw.numberOfTelevisions),
      numberOfStorageObjects: n(raw.numberOfStorageObjects),
      numberOfObjects: n(raw.numberOfObjects),
      description: raw.description ?? "",
    };
  }

  export function convertTakeoffData(raw: RendrTakeoffData): ImperialTakeoffData {
    return {
      flexFileUuid: raw.flex_file_uuid,
      flexFileVersion: raw.flex_file_version,
      spaceTakeoff: convertRoomTakeoff(raw.space.spaceTakeoff),
      rooms: raw.space.rooms.map((r) => ({
        label: r.label,
        takeoff: convertRoomTakeoff(r.roomTakeoff),
      })),
    };
  }


================================================================
SUMMARY: KEY FINDINGS
================================================================

1. Fields that will be affected by this phase:
   Room model:
     - areaSqFt (currently stores Rendr floor SF)
     - pricingNotes (currently stores ALL Rendr data as text — will need restructuring)
     - measurementMode (set to "AREA" on Rendr import)
     - scopeNarrative (read by estimate prompts)
     - scopeQA (read by estimate prompts for Q&A data)
     - lengthFt, widthFt, ceilingHeightFt (used for perimeter/wall calculations)
     - lengthIn, widthIn, ceilingHeightIn (used for area calculation from transcript)
   Project model:
     - rendrSpaceId, rendrImportedAt (Rendr link tracking)
   New fields needed (see #6 below)

2. Existing Kitchen/Bath handling:
   - Name-based classification only (classifyRoomCategory, autoMatchTemplate)
   - Template auto-matching: "kitchen"/"bath" keywords -> catalog template selection
   - Estimate prompt: generic allowance examples, shower tile rules, countertop pairing
   - NO dedicated fixture fields, NO structured Kitchen/Bath detail model
   - Rendr data has rich fixture/cabinet data but it's flattened to text in pricingNotes

3. Data flow for estimate prompts:
   Room dimensions (lengthFt/widthFt OR areaSqFt)
     -> getEffectiveRoomMetrics() computes effectiveSqFt, perimeter, wallSF, ceilingSF
     -> buildUserPrompt() injects PRE-CALCULATED VALUES block
     -> AI MUST use these exact numbers per system prompt rules
     -> AI returns line items with quantities based on these values

   CRITICAL GAP: When room has only areaSqFt (from Rendr) but no L×W dimensions,
   perimeter = 0 and wallSF = null. The estimate prompt says "Not available" for
   wall area, forcing the AI to guess. Rendr HAS this data (wallsSF, perimeterLF)
   but it's trapped in pricingNotes text.

4. COPE data source:
   COPE reads from getProjectAggregateData() which:
     - Sums room effectiveSqFt -> totalAreaSqFt (for cleaning + protection)
     - Sums latest AIEstimate totals -> totalEstimatedPrice (for permits)
     - Detects trades -> scope flags (for plan review determination)
   COPE does NOT directly read room dimensions. It reads aggregate SF from rooms
   and total prices from estimates. Better room data -> better room estimates ->
   better COPE aggregate totals. But COPE's project-area-based calculations
   (cleaning, protection) directly use totalAreaSqFt from rooms.

5. Potential risks / things that could break:
   a) pricingNotes field is currently used as freeform text. If Rendr import changes
      to store data in structured fields, any existing pricingNotes parsing must be
      considered (render checklist uses pricingNotes).
   b) getEffectiveRoomMetrics() falls back to areaSqFt when L×W not available, but
      returns perimeter=0 and wallSF=null. Adding Rendr wall/perimeter data requires
      either storing in new fields or modifying this function to accept alternate sources.
   c) The estimate prompt has rigid "PRE-CALCULATED VALUES" rules. If new Rendr fields
      provide wall SF and perimeter directly, buildUserPrompt() must inject them.
   d) Rendr import currently OVERWRITES areaSqFt and pricingNotes unconditionally.
      Re-importing would lose any manual adjustments.
   e) Room origin is NOT set to "IMPORTED" during Rendr import — only measurementMode
      and pricingNotes indicate Rendr provenance. This is fragile.
   f) investment-rollup.ts reads Room.totalLow/totalTarget/totalHigh. These are set
      by room pricing, not directly by dimensions. But dimension changes -> re-estimate
      -> new totals -> rollup recalculation needed.
   g) COPE aggregate relies on room estimates existing. If dimensions change and
      estimates become stale, COPE won't automatically update.

6. Schema additions needed:
   Based on what exists vs. what Rendr provides:

   Room model additions (for structured Rendr data):
     - wallsSF (Float?) — Rendr wall area, currently in pricingNotes text
     - ceilingSF (Float?) — Rendr ceiling area, currently in pricingNotes text
     - perimeterLF (Float?) — Rendr perimeter, currently in pricingNotes text
     - paintableSF (Float?) — Rendr paintable surface, currently in pricingNotes
     - measurementSource (String?) — "RENDR" | "MANUAL" | "TRANSCRIPT" to track origin

   For Kitchen/Bath detail (if implementing structured fixture tracking):
     - roomDetail (Json?) — structured fixture/cabinet/surface data, e.g.:
       {
         sinks: number, toilets: number, bathtubs: number,
         baseCabinetsLF: number, wallCabinetsLF: number,
         countertopsLF: number, countertopsSF: number,
         backsplashLF: number, backsplashSF: number,
         windowCount: number, doorCount: number,
         fireplaces: number, appliances: {...}
       }

   Alternatively, dedicated typed fields for each fixture/measurement.

7. Files that will need modification:
   Schema & migration:
     - prisma/schema.prisma (add new Room fields)
     - New migration file

   Rendr import:
     - app/admin/projects/[id]/rendr/rendr-actions.ts (store data in structured fields)

   Estimate prompt pipeline:
     - app/lib/effective-room-sf.ts (read wallsSF, perimeterLF from new fields when available)
     - app/lib/ai-estimate-prompt.ts (inject Rendr fixture data for Kitchen/Bath rooms)

   Sections tab:
     - app/admin/projects/[id]/rooms/rooms-tab.tsx (display Kitchen/Bath detail UI?)
     - app/admin/projects/[id]/rooms/actions.ts (room creation/update with new fields)

   Transcript extraction:
     - app/lib/ai/extract-from-transcript.ts (if extracting fixture data from transcript)

   COPE (if needed):
     - app/lib/cope-aggregate-data.ts (if aggregating new measurement fields)

   Conversions (likely unchanged):
     - app/lib/rendr/conversions.ts (already handles all needed conversions)
     - app/lib/rendr/convertTakeoff.ts (already converts all Rendr fields)

================================================================
END OF REPORT
================================================================
