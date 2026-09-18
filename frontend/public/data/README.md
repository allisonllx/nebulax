# Bundled map background

`neighbourhood.json` is an OpenStreetMap extract retrieved via Overpass on 2026-09-19 for this prototype. It contains road/park geometries around Ang Mo Kio, Bishan and Novena, used as a static offline map background.

Copyright OpenStreetMap contributors. Licensed under ODbL: https://www.openstreetmap.org/copyright

Query (single retrieval, cached in the repository):

```overpass
[out:json][timeout:30];
(
  way[highway~"^(primary|secondary|tertiary|residential|trunk)$"](1.312,103.828,1.374,103.86);
  way[leisure=park](1.312,103.828,1.374,103.86);
);
out geom;
```

Conversion retains road category/name and geometry, rounds coordinates to six decimal places and outputs a GeoJSON FeatureCollection. The application displays attribution alongside the map. No raster tiles are prefetched.

The journey overlay is separate illustrative data. It is not a verified accessible route, and this extract does not establish lift connectivity, shelter continuity or hospital interior access.
