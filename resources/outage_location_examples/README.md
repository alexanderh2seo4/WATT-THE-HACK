# Geolocated outage feed examples

These are dated GeoJSON snapshots of published live outage feeds from two British electricity distribution operators. The points provide more location detail than the German Bundesnetzagentur records in this repository, which can only be assigned to the reporting network operator's service area. They are included as comparative examples; they do not describe outages in Bavaria.

## Snapshots

| File | Publisher and coverage | Captured | Features |
| --- | --- | --- | ---: |
| `ssen_distribution_live_outages_2026-10-24.geojson` | SSEN Distribution; SHEPD and SEPD licence areas in northern Scotland and central southern England | Feed timestamp `2026-10-24T09:06:00Z` | 129 |
| `northern_powergrid_live_power_cuts_2026-10-24.geojson` | Northern Powergrid; northeast England, Yorkshire, and North Lincolnshire | Retrieved `2026-10-24T09:06:58Z` | 147 |

Each file is a one-time snapshot of a live feed, not a historical archive. The source fields are retained in each feature's `properties`; `snapshot_retrieved_utc` records the snapshot time. Point geometries use GeoJSON longitude, latitude order (WGS 84 / EPSG:4326).

## Location and use limits

- The points are the operators' published map coordinates. A coordinate is not a verified survey of a damaged asset or a customer's exact location. Both feeds also provide affected postcode or area fields where available.
- SSEN's feed includes planned and unplanned outages. Northern Powergrid's feed covers current, ongoing faults and is updated every five minutes. A snapshot can become stale as soon as the source changes.
- In the captured Northern Powergrid response, some source `loggedtime` and `updatedate` values are later than the recorded retrieval time. The original values are preserved; verify their time basis before using them in chronology or duration calculations.
- These datasets cover parts of Great Britain, not Germany. Do not match their points to `grid_segments` or use them as evidence about the fictional storm or the Bavaria network.
- The snapshots have not been harmonized with the Bundesnetzagentur workbooks. Their fields, reporting scope, outage definitions, and time coverage differ.

## Sources and attribution

### SSEN Distribution

- Dataset: [Real Time Outage Dataset](https://data.ssen.co.uk/@ssen-distribution/realtime_outage_dataset)
- API used for the snapshot: [Power Track Real Time Outage API](https://external.distribution.prd.ssen.co.uk/opendataportal-prd/v4/api/getallfaults)
- Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Attribution: **Contains data from SSEN Distribution, licensed under CC BY 4.0.** The feed is near-real-time, contains planned and unplanned outages, and includes affected postcode information.

### Northern Powergrid

- Dataset: [Live Power Cut Data](https://northernpowergrid.opendatasoft.com/explore/dataset/live-power-cuts-data/)
- API used for the snapshot: [Live Power Cut Data records endpoint](https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/live-power-cuts-data/records)
- Licence: [Northern Powergrid Open Data Licence v1.0](https://northernpowergrid.opendatasoft.com/p/opendatalicence/)
- Required attribution: **Supported by Northern Powergrid Open Data.** The licence permits copying, publishing, distribution, transmission, and adaptation, subject to its terms.
- The source says this is current, ongoing fault data and that the feed is updated every five minutes.

The GeoJSON files are reformatted snapshots of the sources above. Preserve the applicable attribution and licence when reusing them.
