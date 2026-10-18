#!/usr/bin/env python3
"""
crear_mazo.py - Automatización para crear, empaquetar y validar mazos de Challengers!
Uso:
  python crear_mazo.py list-factions
  python crear_mazo.py build --json web/decks/mi_mazo_cards.json [--images-dir decks/mi_mazo]
  python crear_mazo.py validate --zip web/decks/mi_mazo_pack.zip
  python crear_mazo.py update-readme-all
"""

import os
import sys
import json
import zipfile
import argparse
from PIL import Image, ImageDraw

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DECKS_DIR = os.path.join(ROOT_DIR, 'web', 'decks')
WEB_ICONS_DIR = os.path.join(ROOT_DIR, 'web', 'images', 'icons')
CATALOG_PATH = os.path.join(os.path.dirname(__file__), 'catalogo_facciones.json')

def load_catalog():
    if os.path.exists(CATALOG_PATH):
        with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def list_factions():
    catalog = load_catalog()
    print("=" * 90)
    print(" CATÁLOGO OFICIAL DE FACCIONES Y ARQUITECTURA DE BALANCE - CHALLENGERS!")
    print("=" * 90)
    print("REGLA DE ORO DE BALANCE:")
    print("Para no desbalancear el juego al crear un nuevo mazo, CADA CONJUNTO DEBE CALCAR")
    print("EXACTAMENTE UNA FACCIÓN OFICIAL (mismo número de cartas, mismos niveles A/B/C,")
    print("mismas fuerzas base, mismas copias y mecánicas idénticas, cambiando nombre e imagen).")
    print("=" * 90)

    c1_factions = []
    c2_factions = []
    special_factions = []

    for fid, f in catalog.items():
        game = f.get('game', 'both')
        if fid in ['city', 'robot']:
            special_factions.append((fid, f))
        elif game == 'c1':
            c1_factions.append((fid, f))
        elif game == 'c2':
            c2_factions.append((fid, f))
        else:
            special_factions.append((fid, f))

    def print_faction_group(title, flist):
        print(f"\n▶ {title}:")
        print("-" * 90)
        for fid, f in flist:
            name_es = f.get('name', {}).get('es', fid)
            name_en = f.get('name', {}).get('en', fid)
            cards = f.get('cards', [])
            lvls = {}
            total_copies = 0
            for c in cards:
                l = c.get('level', '?')
                lvls[l] = lvls.get(l, 0) + 1
                total_copies += c.get('default_copies', 1)
            lvl_str = ', '.join([f"Nivel {k}: {v}" for k, v in sorted(lvls.items())])
            print(f"  • {name_es:<18} ({name_en:<16}) | ID: {fid:<16} | {len(cards):2} cartas ({total_copies:2} copias) [{lvl_str}]")

    print_faction_group("CHALLENGERS! 1 (JUEGO BASE) - CONJUNTOS DE 40 COPIAS", c1_factions)
    print_faction_group("CHALLENGERS! 2 (BEACH CUP / TORNEO DE VERANO) - CONJUNTOS DE 40 COPIAS", c2_factions)
    print_faction_group("CONJUNTOS ESPECIALES / STARTERS / ROBOT", special_factions)

    print("\n" + "=" * 90)
    print("ESTRUCTURAS ESTÁNDAR RECOMENDADAS PARA TUS FACCIONES:")
    print("  • Estándar 11 cartas (40 copias): 4 Nivel A (15 copias) + 4 Nivel B (15 copias) + 3 Nivel C (10 copias).")
    print("    -> Ejemplos: Castillo, Película, Feria, Naufragio, Playa, Bosque, Montaña, Juguetes, Universidad.")
    print("  • Estándar 10 cartas (40 copias): 3 Nivel A (15 copias) + 4 Nivel B (15 copias) + 3 Nivel C (10 copias).")
    print("    -> Ejemplos: Base Secreta, Casa Embrujada.")
    print("  • Conjunto Arcoíris (20 copias):  2 Nivel A (8 copias) + 2 Nivel B (8 copias) + 1 Nivel C (4 copias).")
    print("=" * 90)

def generate_default_icon(icon_path, faction_name="Facción", color=(59, 130, 246)):
    """Crea un icono minimalista centrado si no se dispone de uno."""
    img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([20, 20, 236, 236], fill=(*color, 240), outline=(255, 255, 255, 255), width=8)
    d.polygon([(128, 45), (200, 85), (200, 160), (128, 215), (56, 160), (56, 85)], fill=(255, 255, 255, 220))
    d.polygon([(128, 65), (185, 100), (185, 150), (128, 195), (71, 150), (71, 100)], fill=(*color, 255))
    os.makedirs(os.path.dirname(icon_path), exist_ok=True)
    img.save(icon_path, format='PNG')
    return icon_path

def generate_readme(deck_data):
    """
    Genera un archivo README.txt trilingüe (ES, EN, FR) estructurado exactamente
    con el resumen del contenido y el detalle carta por carta de cada facción.
    """
    cards = deck_data.get('cards', [])
    sets = deck_data.get('sets', {})
    total_unique = len(cards)
    total_copies = sum(c.get('default_copies', 1) for c in cards)

    # Identificar componentes especiales
    macro_dog_ids = [28, 187, 192, 197, 206, 211, 216, 221]
    starters = [c for c in cards if c.get('is_starter_card') and c.get('id') not in macro_dog_ids]
    starter_copies = sum(c.get('default_copies', 1) for c in starters)
    
    robot_cards = [c for c in cards if c.get('set_id') == 'robot']
    trainer_cards = [c for c in cards if c.get('set_id') == 'trainers']
    rainbow_cards = [c for c in cards if c.get('set_id') == 'rainbow']
    macro_dogs = [c for c in cards if c.get('set_id') == 'city' and c.get('id') in macro_dog_ids]
    city_basic = [c for c in cards if c.get('set_id') == 'city' and not c.get('is_starter_card') and c.get('id') not in macro_dog_ids]

    # Conjuntos adicionales regulares
    std_set_ids = []
    for sid in sets.keys():
        if sid in ['robot', 'trainers', 'rainbow', 'city']:
            continue
        std_set_ids.append(sid)

    lines = []

    # =========================================================================
    # 1. ESPAÑOL
    # =========================================================================
    lines.append("=" * 80)
    lines.append(" ESPAÑOL - RESUMEN DEL CONTENIDO Y DETALLE DEL MAZO")
    lines.append("=" * 80)
    lines.append(f"• Contenido ({total_unique} cartas únicas / {total_copies} copias en total):")
    lines.append("")
    
    if starters:
        cards_per_starter = starter_copies // 8 if starter_copies >= 8 else 6
        lines.append(f"  • 8 mazos de inicio ({cards_per_starter} cartas por mazo con los símbolos de jugador).")
        
    if robot_cards:
        has_cyborg = any(c.get('id') == 1 for c in robot_cards)
        robot_label = "Cíborg" if has_cyborg else "Good Bot / Perrobot"
        r_names = [c.get('es', {}).get('name') or c.get('en', {}).get('name') for c in robot_cards[:4] if c.get('es', {}).get('name') or c.get('en', {}).get('name')]
        r_str = f" con {', '.join(r_names)}, etc." if r_names else ""
        lines.append(f"  • 1 mazo de Robot ({robot_label}) ({len(robot_cards)} cartas / {sum(c.get('default_copies', 1) for c in robot_cards)} copias{r_str}).")
        
    if rainbow_cards:
        rb_names = [c.get('es', {}).get('name') for c in rainbow_cards if c.get('es', {}).get('name')]
        rb_str = f": {', '.join(rb_names)}" if rb_names else ""
        lines.append(f"  • 1 conjunto Arcoíris ({sum(c.get('default_copies', 1) for c in rainbow_cards)} cartas{rb_str}).")
        
    if macro_dogs:
        lines.append("  • 8 cartas de Perro para macrotorneos (cartas de Perro con los iconos de torneo de 16 jugadores).")
        
    if trainer_cards:
        tr_names = [c.get('es', {}).get('name') for c in trainer_cards[:3] if c.get('es', {}).get('name')]
        tr_str = f" ({', '.join(tr_names)}, etc.)" if tr_names else ""
        lines.append(f"  • 16 cartas de Entrenador{tr_str}.")
        
    if city_basic:
        cb_names = [c.get('es', {}).get('name') for c in city_basic if c.get('es', {}).get('name')]
        cb_str = f": {', '.join(cb_names)}" if cb_names else ""
        lines.append(f"  • 1 conjunto básico de Ciudad ({sum(c.get('default_copies', 1) for c in city_basic)} cartas{cb_str}).")

    if std_set_ids:
        # Check standard copies
        first_scards = [c for c in cards if c.get('set_id') == std_set_ids[0] and (not c.get('is_starter_card') or std_set_ids[0] != 'city')]
        copies_note = f" ({sum(c.get('default_copies', 1) for c in first_scards)} cartas en cada uno)" if first_scards else ""
        lines.append(f"  • {len(std_set_ids)} conjuntos adicionales{copies_note}:")
        for idx, sid in enumerate(std_set_ids, 1):
            sinfo = sets[sid]
            sname = sinfo.get('name', {}).get('es', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
            sname_en = sinfo.get('name', {}).get('en') if isinstance(sinfo.get('name'), dict) else None
            scards = [c for c in cards if c.get('set_id') == sid and (not c.get('is_starter_card') or sid != 'city')]
            en_label = f" ({sname_en})" if sname_en and sname_en.lower() != sname.lower() else ""
            lines.append(f"    {idx}. {sname}{en_label} — {len(scards)} cartas.")

    lines.append("")
    lines.append("--- DETALLE CARTA POR CARTA (ESPAÑOL) ---")
    for sid, sinfo in sets.items():
        sname = sinfo.get('name', {}).get('es', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
        scards = [c for c in cards if c.get('set_id') == sid]
        if not scards:
            continue
        lines.append(f"\n[CONJUNTO / FACCIÓN: {sname.upper()}] ({len(scards)} modelos de carta, {sum(c.get('default_copies', 1) for c in scards)} copias)")
        for c in sorted(scards, key=lambda x: (str(x.get('level', 'Z')), int(x['strength']) if str(x.get('strength', '')).isdigit() else 99)):
            lvl = c.get('level', '-')
            st = c.get('strength', '-')
            cop = c.get('default_copies', 1)
            name = c.get('es', {}).get('name') or c.get('name', {}).get('es') or c.get('en', {}).get('name') or f"Carta #{c.get('id')}"
            text = c.get('es', {}).get('text') or c.get('text', {}).get('es') or "(Sin texto de efecto)"
            lines.append(f"  • [Nivel {lvl}] {name} | Fuerza: {st} | Copias: {cop}")
            lines.append(f"    Efecto: {text}")

    # =========================================================================
    # 2. ENGLISH
    # =========================================================================
    lines.append("\n" + "=" * 80)
    lines.append(" ENGLISH - CONTENT SUMMARY AND CARD-BY-CARD DETAILS")
    lines.append("=" * 80)
    lines.append(f"• Content ({total_unique} unique cards / {total_copies} total copies):")
    lines.append("")
    
    if starters:
        cards_per_starter = starter_copies // 8 if starter_copies >= 8 else 6
        lines.append(f"  • 8 starter decks ({cards_per_starter} cards each with player tournament icons).")
        
    if robot_cards:
        has_cyborg = any(c.get('id') == 1 for c in robot_cards)
        robot_label = "Cyborg" if has_cyborg else "Good Bot"
        r_names = [c.get('en', {}).get('name') for c in robot_cards[:4] if c.get('en', {}).get('name')]
        r_str = f": {', '.join(r_names)}, etc." if r_names else ""
        lines.append(f"  • 1 Robot deck ({robot_label}) ({len(robot_cards)} cards / {sum(c.get('default_copies', 1) for c in robot_cards)} copies{r_str}).")
        
    if rainbow_cards:
        rb_names = [c.get('en', {}).get('name') for c in rainbow_cards if c.get('en', {}).get('name')]
        rb_str = f": {', '.join(rb_names)}" if rb_names else ""
        lines.append(f"  • 1 Rainbow set ({sum(c.get('default_copies', 1) for c in rainbow_cards)} cards{rb_str}).")
        
    if macro_dogs:
        lines.append("  • 8 Dog cards for macrotournaments (16-player tournament cards).")
        
    if trainer_cards:
        tr_names = [c.get('en', {}).get('name') for c in trainer_cards[:3] if c.get('en', {}).get('name')]
        tr_str = f" ({', '.join(tr_names)}, etc.)" if tr_names else ""
        lines.append(f"  • 16 Trainer cards{tr_str}.")
        
    if city_basic:
        cb_names = [c.get('en', {}).get('name') for c in city_basic if c.get('en', {}).get('name')]
        cb_str = f": {', '.join(cb_names)}" if cb_names else ""
        lines.append(f"  • 1 Basic City set ({sum(c.get('default_copies', 1) for c in city_basic)} cards{cb_str}).")

    if std_set_ids:
        first_scards = [c for c in cards if c.get('set_id') == std_set_ids[0] and (not c.get('is_starter_card') or std_set_ids[0] != 'city')]
        copies_note = f" ({sum(c.get('default_copies', 1) for c in first_scards)} cards each)" if first_scards else ""
        lines.append(f"  • {len(std_set_ids)} additional sets{copies_note}:")
        for idx, sid in enumerate(std_set_ids, 1):
            sinfo = sets[sid]
            sname_en = sinfo.get('name', {}).get('en', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
            scards = [c for c in cards if c.get('set_id') == sid and (not c.get('is_starter_card') or sid != 'city')]
            lines.append(f"    {idx}. {sname_en} — {len(scards)} cards.")

    lines.append("")
    lines.append("--- CARD-BY-CARD DETAILS (ENGLISH) ---")
    for sid, sinfo in sets.items():
        sname_en = sinfo.get('name', {}).get('en', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
        scards = [c for c in cards if c.get('set_id') == sid]
        if not scards:
            continue
        lines.append(f"\n[SET / FACTION: {sname_en.upper()}] ({len(scards)} card models, {sum(c.get('default_copies', 1) for c in scards)} copies)")
        for c in sorted(scards, key=lambda x: (str(x.get('level', 'Z')), int(x['strength']) if str(x.get('strength', '')).isdigit() else 99)):
            lvl = c.get('level', '-')
            st = c.get('strength', '-')
            cop = c.get('default_copies', 1)
            name = c.get('en', {}).get('name') or c.get('name', {}).get('en') or c.get('es', {}).get('name') or f"Card #{c.get('id')}"
            text = c.get('en', {}).get('text') or c.get('text', {}).get('en') or "(No effect text)"
            lines.append(f"  • [Level {lvl}] {name} | Power: {st} | Copies: {cop}")
            lines.append(f"    Effect: {text}")

    # =========================================================================
    # 3. FRANÇAIS
    # =========================================================================
    lines.append("\n" + "=" * 80)
    lines.append(" FRANÇAIS - RÉSUMÉ DU CONTENU ET DÉTAIL DES CARTES")
    lines.append("=" * 80)
    lines.append(f"• Contenu ({total_unique} cartes uniques / {total_copies} exemplaires au total) :")
    lines.append("")
    
    if starters:
        cards_per_starter = starter_copies // 8 if starter_copies >= 8 else 6
        lines.append(f"  • 8 decks de départ ({cards_per_starter} cartes par deck avec les symboles de joueur).")
        
    if robot_cards:
        has_cyborg = any(c.get('id') == 1 for c in robot_cards)
        robot_label = "Cyborg" if has_cyborg else "Good Bot"
        r_names = [c.get('fr', {}).get('name') or c.get('en', {}).get('name') for c in robot_cards[:4] if c.get('fr', {}).get('name') or c.get('en', {}).get('name')]
        r_str = f" : {', '.join(r_names)}, etc." if r_names else ""
        lines.append(f"  • 1 deck Robot ({robot_label}) ({len(robot_cards)} cartes / {sum(c.get('default_copies', 1) for c in robot_cards)} exemplaires{r_str}).")
        
    if rainbow_cards:
        rb_names = [c.get('fr', {}).get('name') or c.get('en', {}).get('name') for c in rainbow_cards if c.get('fr', {}).get('name') or c.get('en', {}).get('name')]
        rb_str = f" : {', '.join(rb_names)}" if rb_names else ""
        lines.append(f"  • 1 ensemble Arc-en-ciel ({sum(c.get('default_copies', 1) for c in rainbow_cards)} cartes{rb_str}).")
        
    if macro_dogs:
        lines.append("  • 8 cartes Chien pour macrotournois (cartes de tournoi à 16 joueurs).")
        
    if trainer_cards:
        tr_names = [c.get('fr', {}).get('name') or c.get('en', {}).get('name') for c in trainer_cards[:3] if c.get('fr', {}).get('name') or c.get('en', {}).get('name')]
        tr_str = f" ({', '.join(tr_names)}, etc.)" if tr_names else ""
        lines.append(f"  • 16 cartes Entraîneur{tr_str}.")
        
    if city_basic:
        cb_names = [c.get('fr', {}).get('name') or c.get('en', {}).get('name') for c in city_basic if c.get('fr', {}).get('name') or c.get('en', {}).get('name')]
        cb_str = f" : {', '.join(cb_names)}" if cb_names else ""
        lines.append(f"  • 1 ensemble basique Ville ({sum(c.get('default_copies', 1) for c in city_basic)} cartes{cb_str}).")

    if std_set_ids:
        first_scards = [c for c in cards if c.get('set_id') == std_set_ids[0] and (not c.get('is_starter_card') or std_set_ids[0] != 'city')]
        copies_note = f" ({sum(c.get('default_copies', 1) for c in first_scards)} cartes dans chaque ensemble)" if first_scards else ""
        lines.append(f"  • {len(std_set_ids)} ensembles additionnels{copies_note} :")
        for idx, sid in enumerate(std_set_ids, 1):
            sinfo = sets[sid]
            sname_fr = sinfo.get('name', {}).get('fr', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
            scards = [c for c in cards if c.get('set_id') == sid and (not c.get('is_starter_card') or sid != 'city')]
            lines.append(f"    {idx}. {sname_fr} — {len(scards)} cartes.")

    lines.append("")
    lines.append("--- DÉTAIL CARTE PAR CARTE (FRANÇAIS) ---")
    for sid, sinfo in sets.items():
        sname_fr = sinfo.get('name', {}).get('fr', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
        scards = [c for c in cards if c.get('set_id') == sid]
        if not scards:
            continue
        lines.append(f"\n[ENSEMBLE / FACTION : {sname_fr.upper()}] ({len(scards)} modèles de carte, {sum(c.get('default_copies', 1) for c in scards)} exemplaires)")
        for c in sorted(scards, key=lambda x: (str(x.get('level', 'Z')), int(x['strength']) if str(x.get('strength', '')).isdigit() else 99)):
            lvl = c.get('level', '-')
            st = c.get('strength', '-')
            cop = c.get('default_copies', 1)
            name = c.get('fr', {}).get('name') or c.get('name', {}).get('fr') or c.get('es', {}).get('name') or f"Carte #{c.get('id')}"
            text = c.get('fr', {}).get('text') or c.get('text', {}).get('fr') or "(Aucun effet de texte)"
            lines.append(f"  • [Niveau {lvl}] {name} | Force : {st} | Exemplaires : {cop}")
            lines.append(f"    Effet : {text}")

    lines.append("\n" + "=" * 80)
    lines.append("CHALLENGERS! CARD VIEWER - OFFICIAL COMPATIBLE PACKAGE")
    lines.append("=" * 80)
    return "\n".join(lines)

def build_pack(json_path, images_dir=None, out_zip_path=None):
    """Empaqueta un JSON y sus imágenes en el ZIP oficial con el README trilingüe."""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not out_zip_path:
        base_name = os.path.basename(json_path).replace('_cards.json', '').replace('.json', '')
        out_zip_path = os.path.join(WEB_DECKS_DIR, f"{base_name}_pack.zip")

    os.makedirs(os.path.dirname(out_zip_path), exist_ok=True)
    readme_content = generate_readme(data)

    print(f"Creando paquete ZIP: {out_zip_path}...")
    with zipfile.ZipFile(out_zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        # 1. cards.json
        z.writestr('cards.json', json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
        # 2. README.txt trilingüe
        z.writestr('README.txt', readme_content.encode('utf-8'))

        # 3. Iconos de facción
        sets = data.get('sets', {})
        for sid, sinfo in sets.items():
            icon_fn = sinfo.get('icon_path')
            if icon_fn:
                icon_src = None
                for candidate in [
                    os.path.join(images_dir, icon_fn) if images_dir else None,
                    os.path.join(WEB_ICONS_DIR, icon_fn),
                    os.path.join(ROOT_DIR, 'decks', icon_fn),
                    os.path.join(ROOT_DIR, 'web', 'images', 'icons', icon_fn)
                ]:
                    if candidate and os.path.exists(candidate):
                        icon_src = candidate
                        break
                if not icon_src:
                    icon_src = os.path.join(WEB_ICONS_DIR, icon_fn)
                    generate_default_icon(icon_src, sinfo.get('name', {}).get('es', sid))
                with open(icon_src, 'rb') as f:
                    z.writestr(f"images/icons/{icon_fn}", f.read())

        # 4. Ilustraciones de cartas
        cards = data.get('cards', [])
        for c in cards:
            art_fn = c.get('art_image') or c.get('card_image')
            if not art_fn:
                continue
            art_src = None
            for candidate in [
                os.path.join(images_dir, art_fn) if images_dir else None,
                os.path.join(ROOT_DIR, 'decks', art_fn),
                os.path.join(ROOT_DIR, 'decks', 'dioses', art_fn),
                os.path.join(ROOT_DIR, 'decks', 'yokais', art_fn),
                os.path.join(ROOT_DIR, 'web', 'images', 'art_digital', art_fn),
                os.path.join(ROOT_DIR, 'web', 'images', 'cards_digital', art_fn)
            ]:
                if candidate and os.path.exists(candidate):
                    art_src = candidate
                    break
            if art_src and os.path.exists(art_src):
                with open(art_src, 'rb') as f:
                    z.writestr(f"images/art_digital/{art_fn}", f.read())
            else:
                pass

    size_mb = os.path.getsize(out_zip_path) / (1024 * 1024)
    print(f"Paquete generado con éxito: {out_zip_path} ({size_mb:.2f} MB)")
    return out_zip_path

def validate_pack(zip_path):
    """Valida la integridad de un paquete de cartas ZIP y comprueba el balance de facciones."""
    print(f"Validando paquete: {zip_path}...")
    if not os.path.exists(zip_path):
        print(f"Error: El archivo {zip_path} no existe.")
        return False

    with zipfile.ZipFile(zip_path, 'r') as z:
        names = z.namelist()
        if 'cards.json' not in names:
            print("Error: Falta 'cards.json' en la raíz del ZIP.")
            return False

        cards_data = json.loads(z.read('cards.json').decode('utf-8'))
        cards = cards_data.get('cards', [])
        sets = cards_data.get('sets', {})

        title_val = cards_data.get('title', cards_data.get('description', 'Sin título'))
        if isinstance(title_val, dict):
            title_str = title_val.get('es', title_val.get('en', next(iter(title_val.values()), 'Sin título')))
        else:
            title_str = str(title_val)
        print(f"  • Título / Colección: {title_str[:60]}...")
        print(f"  • Facciones ({len(sets)}): {', '.join(sets.keys())}")
        print(f"  • Total de cartas únicas: {len(cards)}")
        print(f"  • Total de copias en mazo: {sum(c.get('default_copies', c.get('copies', 1)) for c in cards)}")

        # Comprobar README.txt
        if 'README.txt' in names:
            print("  [OK] Archivo 'README.txt' multilingüe presente en el ZIP.")
        else:
            print("  [AVISO] Falta 'README.txt' multilingüe en el ZIP.")

        # Validación de balance
        print("  • Comprobando balance de facciones contra el estándar oficial:")
        for sid, sinfo in sets.items():
            if sid in ['robot', 'trainers', 'city']:
                continue
            scards = [c for c in cards if c.get('set_id') == sid]
            scopies = sum(c.get('default_copies', c.get('copies', 1)) for c in scards)
            sname = sinfo.get('name', {}).get('es', sid) if isinstance(sinfo.get('name'), dict) else sinfo.get('name', sid)
            
            # Chequeo de paridad con facciones oficiales estándar (11 cartas / 40 copias o 10 cartas / 40 copias o 5 / 20 copias)
            if len(scards) in [10, 11] and scopies == 40:
                print(f"     ✓ Facción '{sname}' ({sid}): {len(scards)} cartas, {scopies} copias [BALANCE ESTÁNDAR 40 COPIAS]")
            elif len(scards) == 5 and scopies == 20:
                print(f"     ✓ Facción '{sname}' ({sid}): {len(scards)} cartas, {scopies} copias [BALANCE ARCOÍRIS 20 COPIAS]")
            else:
                print(f"     ℹ Facción '{sname}' ({sid}): {len(scards)} cartas, {scopies} copias [Configuración no estándar o personalizada]")

        # Comprobar imágenes
        missing_images = []
        for c in cards:
            art_fn = c.get('art_image') or c.get('card_image') or c.get('image')
            if art_fn:
                candidates = [
                    f"images/art_digital/{art_fn}",
                    f"images/cards_digital/{art_fn}",
                    art_fn
                ]
                if not any(cand in names for cand in candidates):
                    missing_images.append((c.get('id'), art_fn))

        if missing_images:
            print(f"  [ALERTA] Faltan {len(missing_images)} imágenes en el archivo ZIP:")
            for cid, fn in missing_images[:10]:
                print(f"     - ID {cid}: {fn}")
            return False
        else:
            print("  [OK] Todas las imágenes de cartas están presentes en el ZIP.")

        return True

def update_readme_all_packs():
    """Actualiza o inyecta el README.txt trilingüe en todos los paquetes ZIP de web/decks."""
    print("=" * 80)
    print(" ACTUALIZANDO README.txt TRILINGÜE EN TODOS LOS MAZOS ZIP...")
    print("=" * 80)
    for fname in os.listdir(WEB_DECKS_DIR):
        if not fname.endswith('_pack.zip') and fname != 'plantilla_mazo.zip':
            continue
        if fname == 'plantilla_mazo.zip':
            continue
        zip_path = os.path.join(WEB_DECKS_DIR, fname)
        print(f"\nProcesando {fname}...")
        with zipfile.ZipFile(zip_path, 'r') as z_in:
            names = z_in.namelist()
            if 'cards.json' not in names:
                print(f"  Omitiendo {fname}: no contiene cards.json")
                continue
            cards_data = json.loads(z_in.read('cards.json').decode('utf-8'))
            readme_text = generate_readme(cards_data)
            
            # Escribir en zip temporal y reemplazar
            temp_zip = zip_path + '.tmp'
            with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z_out:
                for item in z_in.infolist():
                    if item.filename == 'README.txt':
                        continue
                    z_out.writestr(item, z_in.read(item.filename))
                z_out.writestr('README.txt', readme_text.encode('utf-8'))
                
        os.replace(temp_zip, zip_path)
        print(f"  [OK] README.txt trilingüe inyectado con éxito en {fname}")

def main():
    parser = argparse.ArgumentParser(description="Challengers! Deck Builder CLI")
    subparsers = parser.add_subparsers(dest="command")

    # Command: list-factions
    subparsers.add_parser("list-factions", help="Lista las facciones oficiales y sus cartas para referencia de correspondencia")

    # Command: build
    build_parser = subparsers.add_parser("build", help="Construye un paquete ZIP a partir de un JSON de mazo")
    build_parser.add_argument("--json", required=True, help="Ruta al archivo cards.json del mazo")
    build_parser.add_argument("--images-dir", help="Directorio donde se encuentran las imágenes")
    build_parser.add_argument("--out-zip", help="Ruta de destino del archivo ZIP resultante")

    # Command: validate
    val_parser = subparsers.add_parser("validate", help="Valida un archivo ZIP de mazo existente")
    val_parser.add_argument("--zip", required=True, help="Ruta al archivo .zip a validar")

    # Command: update-readme-all
    subparsers.add_parser("update-readme-all", help="Regenera el README.txt trilingüe en todos los ZIPs existentes en web/decks/")

    args = parser.parse_args()

    if args.command == "list-factions":
        list_factions()
    elif args.command == "build":
        build_pack(args.json, args.images_dir, args.out_zip)
    elif args.command == "validate":
        validate_pack(args.zip)
    elif args.command == "update-readme-all":
        update_readme_all_packs()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
