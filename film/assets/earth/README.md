# Earth maps

Copied from *The Arrow of Time* by Abhishek Pradhan (https://github.com/abhishekpradhan/the-arrow-of-time,
`assets/earth/`, MIT licence for the repository's files), which generated them with `tools/assets/build_earth.py`
from [Natural Earth](https://www.naturalearthdata.com/) vector data (public domain). Equirectangular, longitude
-180..180 left to right, latitude 90..-90 top to bottom.

- `albedo.png`: sRGB present-day land colour
- `masks.png`: R land, G ocean depth (0..6000 m), B ice
- `relief.png`: R relief height, G city lights

They are used only when rendering film-look videos on the owner's Mac; the site ships the rendered videos, not these maps.
