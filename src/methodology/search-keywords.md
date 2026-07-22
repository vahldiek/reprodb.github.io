---
title: "Methodology: Search Keywords"
permalink: /methodology/search-keywords.html
skip_chartjs: true
---

The [search bar]({{ '/' | relative_url }}) supports special `#` keywords that filter results by specific criteria. Keywords can be combined with each other and with free text.

| Keyword | Description |
|---|---|
| `#unavailable` | Artifacts whose URLs may no longer be accessible (checked periodically via automated HTTP probes) |
| `#awarded` | Award-winning artifacts only |
| `#github` | Artifacts hosted on GitHub |
| `#zenodo` | Artifacts hosted on Zenodo |
| `#nourl` | Artifacts with no artifact URL recorded |
| `#artifinder` | Results tagged as ArtiFinder-discovered only |
| `#available` | Artifacts with the Available badge |
| `#functional` | Artifacts with the Functional badge |
| `#reproduced` | Artifacts with the Reproduced badge |
| `#reproducible` | Alias for `#reproduced` |
| `#reusable` | Artifacts with the Reusable badge |
| `#evaluated` | Artifacts with the Artifact Evaluated badge |

**Examples:**

- `#unavailable` - all artifacts with potentially dead links
- `#awarded OSDI` - award-winning OSDI artifacts
- `#github #unavailable 2022` - GitHub-hosted artifacts from 2022 with dead links
- `#zenodo fuzzing` - Zenodo-hosted fuzzing artifacts
- `#artifinder malware` - ArtiFinder-tagged artifacts matching "malware"
- `#available #functional` - artifacts that are both available and functional
- `#reproducible usenixsec` - reproduced artifacts for USENIX Security

Keywords also work alongside the year, venue, and area dropdown filters.

**Note on `#unavailable`:** Availability is determined by automated URL checks that run as part of the monthly pipeline. A URL marked as unavailable may be temporarily down, rate-limited, or require authentication. The hover tooltip on each flagged artifact shows when the check was last performed.
