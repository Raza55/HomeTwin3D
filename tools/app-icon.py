"""Generates the HomeTwin3D app icon (SVG): an isometric house with glowing
edges and a lit window over a floor grid - the home's digital twin.

    python tools/app-icon.py          -> branding/icon.svg, icon-maskable.svg, icon-small.svg
    node tools/render-icons.mjs       -> PNG/ICO sizes for the app and the add-on

Variants: `icon` (rounded tile, glow), `maskable` (full-bleed background,
motif inside the 80 % safe zone for Android/PWA masks), `small` (favicon:
no grid or blur, heavier lines so it reads at 16-32 px).
"""
import math
import os

COS, SIN = math.cos(math.radians(30)), math.sin(math.radians(30))
H, R = 0.72, 0.42  # wall height and roof rise (house footprint is 1 x 1)

BG_IN, BG_OUT = '#14375a', '#060c15'
EDGE, EDGE_SOFT = '#72e6ff', '#3fb6e6'
WALL_FRONT, WALL_SIDE = '#173652', '#1f4a6b'
ROOF_NEAR, ROOF_FAR = '#2a6690', '#1b4264'
WINDOW, WINDOW_GLOW = '#ffd27a', '#ffb347'


def project(k, cx, cy):
    def iso(x, y, z):
        return (cx + (x - y) * COS * k, cy + (x + y) * SIN * k - z * k)
    return iso


def poly(iso, points):
    return ' '.join(f'{px:.1f},{py:.1f}' for px, py in (iso(*p) for p in points))


def house(iso, k, small):
    """Faces back to front, then edges, window and door."""
    stroke = max(6, k * (0.045 if small else 0.028))
    faces = [
        (ROOF_FAR, [(-.5, -.5, H), (-.5, .5, H), (0, .5, H + R), (0, -.5, H + R)]),
        (WALL_SIDE, [(.5, -.5, 0), (.5, .5, 0), (.5, .5, H), (.5, -.5, H)]),
        (WALL_FRONT, [(-.5, .5, 0), (.5, .5, 0), (.5, .5, H), (0, .5, H + R), (-.5, .5, H)]),
        (ROOF_NEAR, [(0, -.5, H + R), (0, .5, H + R), (.5, .5, H), (.5, -.5, H)]),
    ]
    out = [f'<polygon points="{poly(iso, pts)}" fill="{fill}"/>' for fill, pts in faces]
    # Soft light on the near roof slope.
    out.append(f'<polygon points="{poly(iso, faces[3][1])}" fill="url(#roofSheen)"/>')
    window = [(-.34, .5, .24), (-.06, .5, .24), (-.06, .5, .52), (-.34, .5, .52)]
    door = [(.1, .5, 0), (.3, .5, 0), (.3, .5, .44), (.1, .5, .44)]
    side_window = [(.5, -.32, .3), (.5, -.08, .3), (.5, -.08, .52), (.5, -.32, .52)]
    out.append(f'<polygon points="{poly(iso, window)}" fill="{WINDOW}"/>')
    if not small:
        # Warm light around the window (gradient, not a filter: renders the same everywhere).
        wx, wy = iso(-.2, .5, .38)
        out.append(f'<ellipse cx="{wx:.1f}" cy="{wy:.1f}" rx="{k * .42:.1f}" ry="{k * .36:.1f}" fill="url(#warmGlow)"/>')
    out.append(f'<polygon points="{poly(iso, door)}" fill="#0b1b2b"/>')
    if not small:
        out.append(f'<polygon points="{poly(iso, side_window)}" fill="{EDGE}" opacity=".35"/>')
    edges = [
        [(-.5, .5, 0), (.5, .5, 0), (.5, -.5, 0)],                       # ground line
        [(-.5, .5, 0), (-.5, .5, H), (0, .5, H + R), (.5, .5, H), (.5, .5, 0)],  # front gable
        [(.5, .5, H), (.5, -.5, H), (.5, -.5, 0)],                        # side wall
        [(0, .5, H + R), (0, -.5, H + R), (.5, -.5, H)],                  # ridge, far eave
        [(-.5, .5, H), (-.5, -.5, H), (0, -.5, H + R)],                   # far roof slope
    ]
    lines = ''.join(f'<polyline points="{poly(iso, e)}"/>' for e in edges)
    group = f'<g fill="none" stroke="{EDGE}" stroke-width="{stroke:.1f}" stroke-linejoin="round" stroke-linecap="round">{lines}</g>'
    if small:
        out.append(group)
    else:
        out.append(f'<g filter="url(#glow)" opacity=".85">{group}</g>')
        out.append(group)
    return out


def grid(iso, k):
    lines = []
    n, span = 8, 1.45
    for i in range(n + 1):
        t = -span + 2 * span * i / n
        lines.append(f'<line x1="{iso(t, -span, 0)[0]:.1f}" y1="{iso(t, -span, 0)[1]:.1f}" x2="{iso(t, span, 0)[0]:.1f}" y2="{iso(t, span, 0)[1]:.1f}"/>')
        lines.append(f'<line x1="{iso(-span, t, 0)[0]:.1f}" y1="{iso(-span, t, 0)[1]:.1f}" x2="{iso(span, t, 0)[0]:.1f}" y2="{iso(span, t, 0)[1]:.1f}"/>')
    return f'<g stroke="{EDGE_SOFT}" stroke-width="{k * .008:.1f}" opacity=".55" mask="url(#fade)">{"".join(lines)}</g>'


def svg(variant):
    small, maskable = variant == 'small', variant == 'maskable'
    size = 1024
    # Maskable: motif inside the 80 % safe zone; small: larger motif for 16-32 px.
    scale = .78 if maskable else 1.2 if small else 1.0
    k = 300 * scale
    cx, cy = 512, 512 + 125 * scale
    iso = project(k, cx, cy)
    defs = f'''<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="70%">
    <stop offset="0" stop-color="{BG_IN}"/><stop offset="1" stop-color="{BG_OUT}"/>
  </radialGradient>
  <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="{EDGE}" stop-opacity=".35"/><stop offset="1" stop-color="{EDGE}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="roofSheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="fadeGrad" cx="{cx / size:.3f}" cy="{cy / size:.3f}" r="{.42 * scale:.3f}">
    <stop offset=".35" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
  </radialGradient>
  <mask id="fade"><rect width="{size}" height="{size}" fill="url(#fadeGrad)"/></mask>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="{14 * scale:.1f}"/></filter>
  <radialGradient id="warmGlow"><stop offset="0" stop-color="{WINDOW_GLOW}" stop-opacity=".55"/><stop offset=".45" stop-color="{WINDOW_GLOW}" stop-opacity=".18"/><stop offset="1" stop-color="{WINDOW_GLOW}" stop-opacity="0"/></radialGradient>
</defs>'''
    radius = 0 if maskable else 228
    body = [f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#bg)"/>']
    if not small:
        body.append(f'<ellipse cx="{cx}" cy="{cy + 20 * scale:.1f}" rx="{430 * scale:.1f}" ry="{250 * scale:.1f}" fill="url(#floorGlow)"/>')
        body.append(grid(iso, k))
    body += house(iso, k, small)
    if not maskable and not small:
        # Fine rim so the tile holds its shape on dark home screens.
        body.append(f'<rect x="6" y="6" width="{size - 12}" height="{size - 12}" rx="{radius - 6}" fill="none" stroke="{EDGE}" stroke-opacity=".18" stroke-width="4"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">\n{defs}\n' + '\n'.join(body) + '\n</svg>\n'


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(__file__), '..', 'branding')
    os.makedirs(root, exist_ok=True)
    for name, variant in [('icon', 'icon'), ('icon-maskable', 'maskable'), ('icon-small', 'small')]:
        with open(os.path.join(root, f'{name}.svg'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg(variant))
    print('written: branding/icon.svg, icon-maskable.svg, icon-small.svg')
