# Sistema de Creación, Balance y Empaquetado de Mazos para Challengers!

Este directorio contiene las especificaciones oficiales, herramientas de automatización CLI, catálogos de referencia de facciones y plantillas para crear, empaquetar y validar mazos temáticos en el visor de cartas de Challengers!.

---

## ⚖️ REGLA DE ORO DE BALANCE PARA NUEVOS MAZOS

> [!IMPORTANT]
> **Para NO desbalancear el juego al crear un nuevo mazo o temática (re-theme):**
> Cada conjunto temático personalizado **DEBE CALCAR EXACTAMENTE UNA FACCIÓN OFICIAL**.
> 
> Debe mantener de forma 1:1:
> 1. El **mismo número total de cartas** (ej. 11 cartas estándar, 10 en Base Secreta/Casa Embrujada, 5 en Arcoíris).
> 2. La **misma distribución de niveles** (Nivel A, Nivel B, Nivel C).
> 3. Las **mismas fuerzas básicas** de cada carta.
> 4. El **mismo número de copias por carta** (`default_copies`) para sumar las 40 copias exactas por conjunto (o 20 en Arcoíris).
> 5. Las **mismas mecánicas y efectos de texto**.
>
> **Únicamente se reemplazan el nombre, la ilustración y la ambientación temática** de las cartas. De este modo, cualquier mazo nuevo es 100% compatible y equilibrado competitivamente con los mazos oficiales.

---

## 📦 Contenido Oficial de Cada Juego

### 🏆 1. CHALLENGERS! 1 (JUEGO BASE)
* **Archivo base:** [`web/decks/challengers_base_cards.json`](file:///c:/Users/sergi/Desktop/MANUALES/challengers/web/decks/challengers_base_cards.json)
* **Paquete ZIP:** [`web/decks/challengers_base_pack.zip`](file:///c:/Users/sergi/Desktop/MANUALES/challengers/web/decks/challengers_base_pack.zip)
* **Contenido (116 cartas únicas / 321 copias en total):**
  - **8 mazos de inicio:** 6 cartas en cada uno (Novato x3, Atleta x1, Perro x1, Campeona x1) con los 8 símbolos de torneo de jugador (Trébol, Pica, Corazón, Diamante, Estrella, Hexágono, Luna, Cuadrado).
  - **1 mazo del Robot (Good Bot / Perrobot):** 13 cartas de bot/solitario (Alpha, Beta, Good Bot, C.H.A.M.P., Fantasma Virtual, Amigo Cíborg, Mecánica, Caballero-Robot, Dron, Necromecánico, Chatbot, Robograma, Autocorregir).
  - **1 conjunto básico de Ciudad:** 20 cartas (Reportero x4, Atleta x3, Mascota x4, Perro x3, Autobús de hinchas x4, Campeona x2).
  - **6 conjuntos adicionales (40 cartas en cada uno):**
    1. **Castillo** (*Castle*) — 11 cartas (40 copias).
    2. **Estudio de Cine** (*Film Studio*) — 11 cartas (40 copias).
    3. **Feria** (*Funfair*) — 11 cartas (40 copias).
    4. **Casa embrujada** (*Haunted House*) — 10 cartas (40 copias).
    5. **Espacio exterior** (*Outer Space*) — 11 cartas (40 copias).
    6. **Naufragio** (*Shipwreck*) — 11 cartas (40 copias).

---

### 🏖️ 2. CHALLENGERS! 2 (BEACH CUP / TORNEO DE VERANO)
* **Archivo base:** [`web/decks/beach_cup_cards.json`](file:///c:/Users/sergi/Desktop/MANUALES/challengers/web/decks/beach_cup_cards.json)
* **Paquete ZIP:** [`web/decks/beach_cup_pack.zip`](file:///c:/Users/sergi/Desktop/MANUALES/challengers/web/decks/beach_cup_pack.zip)
* **Contenido (141 cartas únicas / 352 copias en total):**
  - **8 mazos de inicio:** 6 cartas en cada uno con los 8 símbolos de jugador.
  - **1 mazo del Robot (Cíborg):** 15 cartas (20 copias: Cíborg x5, Superbot x2, Zombot x1, Animación x1, Comprador x1, Software x1, Marioneta de metal x1, E-Esquiador x1, Payaso de hierro x1, Demoledor de ciudades x1, Autodetectar x1, más las 4 cartas iniciales del Robot: Alfa x1, Beta x1, Perrobot x1, Robocampeona x1).
  - **1 conjunto Arcoíris:** 20 cartas (DJ x4, Mochilero x4, Impostor x4, Streamer x4, Patinadora x4).
  - **8 cartas de Perro para macrotorneos:** cartas de Perro dedicadas con los símbolos de jugador para torneos de hasta 16 jugadores.
  - **16 cartas de Entrenador:** 16 cartas únicas (1 copia cada una: Fortalecedor/Uplifter, Estratega, Defensor, etc.).
  - **6 conjuntos adicionales (40 cartas en cada uno):**
    1. **Club de Playa** (*Beach Club*) — 11 cartas (40 copias).
    2. **Bosque Mágico** (*Fairytale Forest*) — 11 cartas (40 copias).
    3. **Montaña** (*Mountain Top*) — 11 cartas (40 copias).
    4. **Base Secreta** (*Secret Base*) — 10 cartas (40 copias).
    5. **Juguetería** (*Toy Store*) — 11 cartas (40 copias).
    6. **Universidad** (*University*) — 11 cartas (40 copias).

---

## 📄 Formato del Archivo `README.txt` Incluido en cada `.zip`

Cada paquete `.zip` generado debe incluir en su raíz un archivo `README.txt` redactado en los **tres idiomas oficiales** (Español, English, Français) con dos secciones obligatorias:
1. **Resumen estructurado del contenido** (totales, mazos de inicio, robot, especiales y lista numerada de conjuntos adicionales con sus conteos).
2. **Detalle carta por carta** de cada facción (Nivel, Nombre, Fuerza base, Copias y Texto de Efecto).

El CLI [`crear_mazo.py`](file:///c:/Users/sergi/Desktop/MANUALES/challengers/crearMazo/crear_mazo.py) genera e inyecta esta información automáticamente.

---

## 🛠️ Herramienta CLI de Automatización: `crear_mazo.py`

### Comandos Disponibles:

1. **Consultar catálogo y correspondencias de balance:**
   ```bash
   python crearMazo/crear_mazo.py list-factions
   ```
   Muestra las facciones divididas por Juego Base y Expansión, con su número exacto de cartas y copias por nivel.

2. **Construir paquete ZIP:**
   ```bash
   python crearMazo/crear_mazo.py build --json web/decks/mi_mazo_cards.json [--images-dir decks/mi_mazo]
   ```
   - Empaqueta `cards.json`.
   - Genera automáticamente el `README.txt` trilingüe con el desglose exacto.
   - Crea iconos por defecto si no existen.
   - Empaqueta las ilustraciones optimizadas en `images/art_digital/`.

3. **Validar un mazo ZIP existente y su balance:**
   ```bash
   python crearMazo/crear_mazo.py validate --zip web/decks/mi_mazo_pack.zip
   ```
   Verifica presencia de `cards.json`, `README.txt`, imágenes y comprueba que las facciones se ajusten al balance estándar de 40 copias.

4. **Regenerar el README trilingüe en todos los ZIPs:**
   ```bash
   python crearMazo/crear_mazo.py update-readme-all
   ```

---

## 🆔 Rangos de IDs Recomendados

Para evitar colisiones entre expansiones y facilitar el filtrado:
- **0 - 199:** Cartas oficiales originales (Juego Base y Beach Cup).
- **200 - 299:** Expansión Yokais.
- **300 - 399:** Expansión Dioses.
- **400 - 499:** Edición Pokémon.
- **500+:** Nuevas expansiones y mazos temáticos de la comunidad.
