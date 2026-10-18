/**
 * =============================================================================
 * CHALLENGERS CARD MAKER - CONTROLADOR PRINCIPAL Y LÓGICA DE APLICACIÓN
 * =============================================================================
 * 
 * @file app.js
 * @description Plataforma web client-side de alto rendimiento para la visualización,
 * gestión, diseño interactivo y exportación para impresión (Print & Play / PnP)
 * de cartas y expansiones temáticas para el juego de mesa Challengers!.
 * 
 * ARQUITECTURA GENERAL DEL SISTEMA:
 * ---------------------------------
 * 1. Estado Reactivo en Memoria:
 *    Gestión centralizada del mazo activo, barajas de inicio, facciones y filtros.
 * 2. Motor de Internacionalización (i18n):
 *    Diccionario de localización multilingüe dinámico (ES, FR, EN, DE, NL, IT).
 * 3. Capa de Persistencia Local (IndexedDB):
 *    Almacenamiento en navegador de paquetes .zip, imágenes en Blob y metadatos.
 * 4. Pipeline de Ingesta ZIP (JSZip):
 *    Descompresión en memoria, resolución de rutas y normalización de cards.json.
 * 5. Motor de Renderizado DOM y CSS 3D:
 *    Tarjetas vectoriales escalables con volteo tridimensional acelerado por GPU.
 * 6. Pipeline de Impresión y Exportación a PDF (jsPDF + html2canvas):
 *    - Tamaño estándar TCG/Poker A4 (63.5 × 88 mm, cuadrícula 3 × 3).
 *    - Tiras de inserción para fundas opacas (63.5 × 27.5 mm, cuadrícula 3 × 9).
 *    - Marcas de corte recto vectoriales para guillotina.
 *    - Hojas de portada y desglose resumen A4 multipágina estructuradas.
 * 
 * @author kr43xpo
 * @version 2.0.0
 * @license MIT
 * =============================================================================
 */

// =============================================================================
// SECCIÓN 1: DEFINICIONES DE TIPOS (JSDoc) Y ESTADO GLOBAL DE LA APLICACIÓN
// =============================================================================

/**
 * @typedef {Object} CardLocaleTexts
 * @property {string} name - Nombre de la carta en el idioma correspondiente.
 * @property {string} [text] - Descripción de la habilidad, efecto o texto de reglas.
 */

/**
 * @typedef {Object} Card
 * @property {number|string} id - Identificador numérico o alfanumérico único de la carta.
 * @property {string} set_id - Clave de la facción o conjunto a la que pertenece la carta.
 * @property {string} level - Nivel de fase o clasificación ('S', 'A', 'B', 'C', 'Entraîneur', 'R').
 * @property {number|string} strength - Valor base de fuerza ('1'-'10', '?' o '∞').
 * @property {number} [default_copies=1] - Número de copias físicas reglamentarias en la baraja.
 * @property {string} [art_image] - Nombre del archivo de ilustración en images/art_digital/.
 * @property {string} [card_image] - Nombre de imagen digital pre-renderizada (modo photo).
 * @property {string} [icon_path] - Icono representativo específico de la carta o facción.
 * @property {number|string} [player_id] - ID de torneo del jugador para cartas de mazo inicial ('1'-'8').
 * @property {boolean} [is_macro_dog] - Indicador booleano para carta perro gigante de torneo.
 * @property {CardLocaleTexts} [es] - Textos en español.
 * @property {CardLocaleTexts} [en] - Textos en inglés.
 * @property {CardLocaleTexts} [fr] - Textos en francés.
 * @property {CardLocaleTexts} [de] - Textos en alemán.
 * @property {CardLocaleTexts} [nl] - Textos en holandés.
 * @property {CardLocaleTexts} [it] - Textos en italiano.
 */

/**
 * @typedef {Object} FactionSet
 * @property {string} id - Identificador único de la facción.
 * @property {Object.<string, string>} name - Nombres localizados por código de idioma.
 * @property {string} [color_hex] - Color primario hexadecimal para fondos y acentos.
 * @property {string} [color_border] - Color secundario hexadecimal para bordes.
 * @property {string} [icon_path] - Nombre del archivo del icono en images/icons/.
 * @property {string} [base_set] - Nombre del set base o juego al que sustituye o expande.
 */

/**
 * Array maestro con la colección completa de cartas cargadas del mazo en memoria.
 * @type {Array<Card>}
 */
let cardsData = [];

/**
 * Diccionario de metadatos de conjuntos y facciones activas indexado por set_id.
 * @type {Object.<string, FactionSet>}
 */
let setsData = {};

/**
 * Lista de iconos y metadatos de los 8 jugadores de torneo provistos por el mazo.
 * @type {Array<Object>}
 */
let playerIconsData = [];

/**
 * Objeto JSON crudo original del archivo cards.json importado actualmente.
 * @type {Object|null}
 */
let currentDeckRaw = null;

/**
 * Código de idioma activo de la interfaz ('es', 'en', 'fr', 'de', 'nl', 'it').
 * @type {string}
 */
let currentLang = 'es';

/**
 * Modo de renderizado visual de cartas activo ('template' = vectorial dinámico | 'photo' = ilustración pura).
 * @type {'template'|'photo'}
 */
let currentViewMode = 'template';

/**
 * Filtro activo de juego o edición ('all' = todas | 'c1' = Base | 'c2' = Beach Cup).
 * @type {string}
 */
let selectedGame = 'all';

/**
 * Filtro activo por facción o color ('all' = todas las facciones).
 * @type {string}
 */
let selectedColor = 'all';

/**
 * Filtro activo por nivel de fase ('all' | 'S' | 'A' | 'B' | 'C' | 'Entraîneur' | 'R').
 * @type {string}
 */
let selectedLevel = 'all';

/**
 * Filtro activo por valor de fuerza ('all' | '1'-'10' | 'special').
 * @type {string}
 */
let selectedStrength = 'all';

/**
 * Cadena de búsqueda en tiempo real introducida por el usuario en el buscador.
 * @type {string}
 */
let searchQuery = '';

/**
 * Índice de la carta actualmente inspeccionada en el modal de detalle (-1 si está cerrado).
 * @type {number}
 */
let currentModalCardIndex = -1;

/**
 * Lista de identificadores de cartas que superan el filtrado actual y son visibles en el DOM.
 * @type {Array<number|string>}
 */
let visibleCardIds = [];

/**
 * Conjunto reactivo con los IDs de cartas que tienen su cara dorsal (reverso) volteada en 3D.
 * @type {Set<number|string>}
 */
let flippedCardIds = new Set();

/**
 * Mapa de asignación de copias físicas para exportación/impresión: ID_Carta -> Cantidad de copias.
 * @type {Map<number|string, number>}
 */
let printQuantities = new Map();

/**
 * Índice de la página A4 visualizada en la vista previa del modal de impresión.
 * @type {number}
 */
let previewCurrentPage = 0;

/**
 * Estado booleano de visibilidad de la lista desplegable de ajuste individual de copias.
 * @type {boolean}
 */
let isCardListOpen = false;

/**
 * Estado general de volteo masivo (true = todas volteadas al reverso, false = anverso).
 * @type {boolean}
 */
let allFlippedState = false;

/**
 * Pestaña de marcador de facción activa en la barra superior ('starter' por defecto).
 * @type {string}
 */
let activeFactionTab = 'starter';

// =============================================================================
// SECCIÓN 2: DICCIONARIO DE INTERNACIONALIZACIÓN (i18n) Y TEXTOS DE INTERFAZ
// =============================================================================
// Soporta 6 idiomas completos: Español (ES), Francés (FR), Inglés (EN),
// Alemán (DE), Holandés (NL) e Italiano (IT).
const i18n = {
    es: {
        subtitle: 'Visor Interactivo y Base de Datos Oficial de Cartas',
        langLabel: 'Idioma:',
        filters: 'Filtros',
        viewModeLabel: 'Modo:',
        templateMode: 'Plantilla',
        photoMode: 'Carta Original',
        searchPlaceholder: 'Buscar por nombre, texto, efecto o facción...',
        resetFilters: 'Restablecer',
        flipAll: 'Voltear cartas',
        flipCard: 'Voltear carta (Girar 180°)',
        viewDetail: 'Ver detalle de la carta',
        headerFlipAll: 'Voltear cartas',
        headerPrint: 'Imprimir',
        headerDeck: 'Mazo',
        footerBrand: 'Challengers Card Maker',
        footerDesc: 'Herramienta comunitaria para cartas personalizadas',
        footerDisclaimer: 'Disclaimer',
        footerScrollTop: 'Volver arriba ↑',
        loadingTitle: 'Cargando mazo...',
        loadingStatus: 'Leyendo cartas e ilustraciones...',
        filterGameTitle: 'Versión:',
        filterColorTitle: 'Facciones:',
        filterLevelTitle: 'Set:',
        filterStrengthTitle: 'Fuerza:',
        countLabel: 'cartas visibles',
        visibleCopiesSuffix: 'copias en total',
        noResultsTitle: 'No se encontraron cartas',
        noResultsText: 'Prueba a cambiar los filtros o los términos de búsqueda.',
        btnReset: 'Restablecer filtros',
        all: 'Todos',
        strengthSpecial: 'Especiales',
        emptyText: '(Sin texto de efecto especial)',
        modalTabTemplate: 'Plantilla Generada',
        modalTabPhoto: 'Carta Digital / Foto Original',
        modalGame: 'Versión',
        modalFaction: 'Facción',
        modalType: 'Tipo / Icono',
        modalLevel: 'Set',
        modalStrength: 'Fuerza',
        modalSource: 'Imagen Fuente',
        starterDeckLabel: 'Mazo Inicial (8 Variantes de Torneo)',
        starterCopiesText: (perPlayer, total) => `${perPlayer}x por jugador (${total} total)`,
        starterDescText: 'Esta carta cuenta con 8 versiones físicas, una por cada icono de jugador del torneo:',
        modalFlipBtnText: 'Voltear carta (3D)',
        modalNavPrev: 'Anterior',
        modalNavNext: 'Siguiente',
        modalClose: 'Cerrar',
        factionHeaderSummary: (count, copies) => `${count} cartas • ${copies} copias en baraja`,
        games: {
            all: 'Todas',
            c1: 'Challengers! 1',
            c2: 'Beach Cup'
        },
        levelLabels: {
            all: 'Todos los Sets',
            A: 'Nivel A',
            B: 'Nivel B',
            C: 'Nivel C',
            S: 'Mazo Inicial',
            Entraîneur: 'Entrenadores',
            SOLO: 'Modo Solo',
            R: 'Robot'
        },
        colors: {
            all: 'Todas las Facciones',
            city: 'Ciudad',
            beach_club: 'Club de Playa',
            fairytale_forest: 'Bosque Mágico',
            mountain_top: 'Montaña',
            rainbow: 'Arcoíris',
            secret_base: 'Base Secreta',
            toy_store: 'Juguetería',
            university: 'Universidad',
            castle: 'Castillo',
            film_studio: 'Estudio de Cine',
            funfair: 'Feria',
            haunted_house: 'Casa embrujada',
            outer_space: 'Espacio exterior',
            shipwreck: 'Naufragio',
            trainers: 'Entrenadores',
            robot: 'Robot',
            cyan: 'Ciudad',
            vert: 'Club de Playa',
            violet: 'Bosque Mágico',
            rose: 'Montaña',
            multicolor: 'Arcoíris',
            marron: 'Base Secreta',
            jaune: 'Juguetería',
            universite: 'Universidad',
            chateau: 'Castillo',
            cinema: 'Estudio de Cine',
            foire: 'Feria',
            hantee: 'Casa embrujada',
            espace: 'Espacio exterior',
            epave: 'Naufragio',
            noir: 'Entrenadores',
            gris: 'Robot'
        },
        factionTabNames: {
            starter: 'Mazos de Inicio',
            robot: 'Mazo de Robot',
            city: 'Conjunto Básico (Ciudad)',
            beach_club: 'Club de Playa',
            fairytale_forest: 'Bosque Mágico',
            mountain_top: 'Montaña',
            rainbow: 'Arcoíris',
            secret_base: 'Base Secreta',
            toy_store: 'Juguetería',
            university: 'Universidad',
            castle: 'Castillo',
            film_studio: 'Estudio de Cine',
            funfair: 'Feria',
            haunted_house: 'Casa Embrujada',
            outer_space: 'Espacio Exterior',
            shipwreck: 'Naufragio',
            trainers: 'Entrenadores',
            all: 'Todas las Cartas'
        },
        print: {
            modalTitle: 'Impresión y Exportación',
            modalSubtitleStandard: 'Formato oficial A4 · 63.5 × 88 mm · Margen blanco 0.5 cm · 9 cartas por hoja',
            modalSubtitleStrips: 'Formato tiras para fundas · 63.5 × 27.5 mm · 27 tiras por hoja A4 (3 × 9)',
            tabSelection: 'Selección de cartas',
            tabFormat: 'Formato de salida',
            quickFiltersTitle: 'Filtros rápidos de selección:',
            btnAll: 'Todas',
            btnFiltered: 'Filtradas actuales',
            btnC1: 'Challengers 1',
            btnC2: 'Beach Cup',
            btnDeselect: 'Deseleccionar',
            factionSelectTitle: 'Selección por facción:',
            btnFactionsAll: 'Todas',
            btnFactionsNone: 'Ninguna',
            qtyDistTitle: 'Distribución de copias',
            presetOfficial: 'Copias de mazo oficial',
            presetSingle: '1 por carta',
            metricUnique: 'Cartas únicas',
            metricPrintCopies: 'Copias a imprimir',
            metricSheets: 'Hojas A4',
            specsLabelStandard: 'Dimensiones oficiales:',
            specsDescStandard: '63.5 × 88 mm &bull; Margen blanco 0.5 cm &bull; Esquinas de corte rectas',
            specsLabelStrips: 'Formato tiras / inserts:',
            specsDescStrips: '63.5 × 27.5 mm &bull; 27 tiras por hoja A4 (3 × 9) &bull; Máximo ahorro de tinta y papel',
            individualBreakdown: 'Desglose y ajuste individual',
            filterFactionLabel: 'Facción:',
            allFactionsOption: 'Todas las facciones',
            langLabel: 'Idioma de impresión',
            layoutLabel: 'Tipo de maquetación',
            layoutTemplateTitle: 'Plantilla traducida',
            layoutTemplateBadge: 'Recomendado',
            layoutTemplateDesc: 'Carta completa con tipografía vectorial nítida y textos en el idioma elegido.',
            layoutBgaTitle: 'Digital original',
            layoutBgaDesc: 'Ilustración recortada en alta definición tal como se visualiza en digital.',
            layoutStripsTitle: 'Tiras de inserción para fundas',
            layoutStripsDesc: 'Nombre y efecto (63.5 × 27.5 mm). 27 tiras por hoja para fundas opacas.',
            whiteMarginLabel: 'Margen perimetral blanco (0.5 cm en los 4 bordes de cada carta)',
            cutGuidesLabel: 'Guías de corte',
            cutCrosses: 'Marcas en esquinas',
            cutGrid: 'Cuadrícula continua',
            cutNone: 'Sin guías',
            artAdjustLabel: 'Ajuste de ilustración',
            artFitLabel: 'Encuadre',
            artFitContain: 'Ajustar al espacio (completa sin recortar)',
            artFitCover: 'Llenar área (recorte automático)',
            artFitHeight: 'Ajustar a la altura',
            artFitWidth: 'Ajustar a la anchura',
            downloadLabel: 'Descargar:',
            btnDownloadPDFStandard: 'Plantilla PDF',
            btnDownloadPDFStrips: 'PDF tiras (27/hoja)',
            btnDownloadImages: 'Cartas como imagen',
            btnPrintDirect: 'Imprimir en navegador',
            previewTitle: 'Vista previa de hoja A4',
            stripSampleLabel: 'Muestra a escala real (tira de inserción):',
            pageOf: (c, t) => `Página ${c} de ${t}`,
            selectedPill: (count) => `${count} seleccionadas`,
            typesSuffix: 'tipos',
            cardsPhysicalSuffix: 'cartas físicas',
            stripsTextSuffix: 'tiras de texto',
            sheetsSuffix: (p, perPage) => `${p} hoja${p === 1 ? '' : 's'} A4 (${perPage} por hoja)`
        },
        manage: {
            modalTitle: 'Gestión del mazo',
            modalSubtitle: 'Información del mazo activo y opciones disponibles',
            activeBadge: 'Mazo activo en el visor',
            loadedCards: (count) => `${count} cartas cargadas`,
            sectionCatalog: 'Biblioteca de mazos',
            sectionCatalogHint: 'Carga directa o descarga en .ZIP',
            btnLoad: 'Cargar',
            btnInUse: '✓ En uso',
            btnChangePack: 'Cargar otro archivo .zip de tu equipo',
            btnChangePackSub: 'Arrastra o haz clic para importar un mazo personalizado',
            btnChangePackBadge: 'Examinar...',
            resourcesLabel: 'Recursos:',
            downloadTemplate: '📄 Plantilla JSON',
            btnGuide: '📖 Guía creadores',
            btnRemovePack: 'Eliminar mazo activo y volver al inicio',
            confirmRemove: '¿Deseas eliminar el mazo de cartas guardado y volver a la pantalla de carga?'
        },
        guide: {
            modalTitle: 'Guía de creación de mazos',
            modalSubtitle: 'Especificación de formato y estructura para diseñar mazos compatibles con el visor',
            intro: 'Puedes crear tu propio mazo de cartas personalizado con tus propias ilustraciones, estadísticas y efectos. El visor lo interpretará de forma nativa, permitiendo voltear las cartas en 3D e imprimirlas en formato torneo oficial.',
            treeTitle: 'Estructura del archivo .zip',
            tableTitle: 'Campos de cada carta en cards.json',
            thField: 'Campo',
            thType: 'Tipo',
            thDesc: 'Valores válidos y función',
            descId: 'Identificador único (ej: 1001 o "carta_1").',
            descLevel: 'Fase o set: "S" (Inicio), "A", "B", "C", "Entraîneur" (Entrenador) o "R" (Robot).',
            descStrength: 'Fuerza base: del 1 al 10, "?" (fuerza variable) o "∞".',
            descSetId: 'Facción/conjunto (ej: "mi_faccion", "city", etc.).',
            descCopies: 'Número de copias físicas en la baraja (ej: 1, 2, 4).',
            descArt: 'Nombre del archivo de imagen en images/art_digital/.',
            descLocales: 'name: Nombre de la carta. text: Efecto o texto explicativo de la habilidad.',
            ctaText: '¿Quieres empezar directamente con un ejemplo funcional? Descarga la plantilla con la estructura JSON básica lista para editar.',
            downloadBtn: 'Descargar plantilla_deck.json'
        },
        disclaimer: {
            modalTitle: 'Aviso Legal y Descargo de Responsabilidad',
            modalSubtitle: 'Condiciones de uso, exención de responsabilidad y derechos de autor',
            lead: 'Esta web es un recurso gratuito y sin fines de lucro desarrollado de forma independiente para permitir a los jugadores y creadores maquetar, visualizar e imprimir sus propias cartas personalizadas.',
            sec1Title: '1. Sin distribución de mazos oficiales',
            sec1Text: 'Esta aplicación no publica, aloja ni comercializa mazos oficiales protegidos por derechos de autor (como cartas originales de Challengers! o marcas comerciales como Pokémon). La plataforma funciona exclusivamente como un motor de visualización local en el navegador del cliente; el usuario debe disponer y cargar sus propios archivos de mazo generados para su uso privado.',
            sec2Title: '2. Responsabilidad exclusiva del usuario',
            sec2Text: 'Cada usuario es el único responsable de los contenidos, imágenes, nombres, logotipos y textos que decida importar, visualizar o exportar a PDF mediante esta herramienta. Los desarrolladores no se hacen responsables del mal uso de la plataforma, de posibles infracciones sobre derechos de propiedad intelectual derivadas de los archivos que cada usuario decida cargar, ni de la reproducción no autorizada de material protegido por parte de terceros.',
            sec3Title: '3. Marcas registradas y titularidad',
            sec3Text: 'Todos los nombres de juegos, ilustraciones, marcas registradas y elementos asociados pertenecen a sus respectivos autores, diseñadores y titulares de derechos. Este proyecto no está patrocinado, afiliado ni respaldado por ninguna editorial ni titular de marca.',
            btnUnderstood: 'Entendido'
        },
        onboarding: {
            title: 'Cargar mazo de cartas',
            desc: 'Selecciona o arrastra un archivo comprimido .zip que contenga la base de datos cards.json y las imágenes del juego.',
            dropText: 'Arrastra y suelta tu archivo .zip aquí',
            dropSubtext: 'o haz clic para explorar en tu dispositivo',
            btnSelect: 'Seleccionar archivo .zip'
        }
    },
    fr: {
        subtitle: 'Visualiseur Interactif et Base de Données des Cartes',
        langLabel: 'Langue :',
        filters: 'Filtres',
        viewModeLabel: 'Mode :',
        templateMode: 'Modèle',
        photoMode: 'Carte Originale',
        searchPlaceholder: 'Rechercher par nom, texte, effet ou faction...',
        resetFilters: 'Réinitialiser',
        flipAll: 'Retourner',
        flipCard: 'Retourner la carte (Tourner 180°)',
        viewDetail: 'Voir les détails de la carte',
        headerFlipAll: 'Retourner',
        headerPrint: 'Imprimer',
        headerDeck: 'Deck',
        footerBrand: 'Challengers Card Maker',
        footerDesc: 'Outil communautaire pour cartes personnalisées',
        footerDisclaimer: 'Mentions légales',
        footerScrollTop: 'Retour en haut ↑',
        loadingTitle: 'Chargement du deck...',
        loadingStatus: 'Extraction des cartes et illustrations...',
        filterGameTitle: 'Version :',
        filterColorTitle: 'Factions :',
        filterLevelTitle: 'Set :',
        filterStrengthTitle: 'Force :',
        countLabel: 'cartes visibles',
        visibleCopiesSuffix: 'copies au total',
        noResultsTitle: 'Aucune carte trouvée',
        noResultsText: 'Essayez de modifier les filtres ou les termes de recherche.',
        btnReset: 'Réinitialiser les filtres',
        all: 'Tous',
        strengthSpecial: 'Spéciaux',
        emptyText: '(Sans texte d\'effet spécial)',
        modalTabTemplate: 'Modèle Généré',
        modalTabPhoto: 'Carte Numérique / Photo Originale',
        modalGame: 'Version',
        modalFaction: 'Faction',
        modalType: 'Type / Icône',
        modalLevel: 'Set',
        modalStrength: 'Force',
        modalSource: 'Image Source',
        starterDeckLabel: 'Deck Initial (8 Variantes de Tournoi)',
        starterCopiesText: (perPlayer, total) => `${perPlayer}x par joueur (${total} total)`,
        starterDescText: 'Cette carte comporte 8 versions physiques, une pour chaque icône de joueur du tournoi :',
        modalFlipBtnText: 'Retourner la carte (3D)',
        modalNavPrev: 'Précédent',
        modalNavNext: 'Suivant',
        modalClose: 'Fermer',
        factionHeaderSummary: (count, copies) => `${count} cartes • ${copies} copies dans le deck`,
        games: {
            all: 'Toutes',
            c1: 'Challengers! 1',
            c2: 'Beach Cup'
        },
        levelLabels: {
            all: 'Tous les Sets',
            A: 'Niveau A',
            B: 'Niveau B',
            C: 'Niveau C',
            S: 'Deck Initial',
            Entraîneur: 'Entraîneurs',
            SOLO: 'Mode Solo',
            R: 'Robot'
        },
        colors: {
            all: 'Toutes les Factions',
            city: 'Ville',
            beach_club: 'Plage',
            fairytale_forest: 'Contes',
            mountain_top: 'Montagne',
            rainbow: 'Arc-en-ciel',
            secret_base: 'Infiltration',
            toy_store: 'Jouets',
            university: 'Université',
            castle: 'Château',
            film_studio: 'Cinéma',
            funfair: 'Fête Foraine',
            haunted_house: 'Maison Hantée',
            outer_space: 'Espace',
            shipwreck: 'Épave',
            trainers: 'Entraîneurs',
            robot: 'Robot',
            cyan: 'Ville',
            vert: 'Plage',
            violet: 'Contes',
            rose: 'Montagne',
            multicolor: 'Arc-en-ciel',
            marron: 'Infiltration',
            jaune: 'Jouets',
            universite: 'Université',
            chateau: 'Château',
            cinema: 'Cinéma',
            foire: 'Fête Foraine',
            hantee: 'Maison Hantée',
            espace: 'Espace',
            epave: 'Épave',
            noir: 'Entraîneurs',
            gris: 'Robot'
        },
        factionTabNames: {
            starter: 'Decks de Départ',
            robot: 'Deck du Robot',
            city: 'Ensemble de Base (Ville)',
            beach_club: 'Plage',
            fairytale_forest: 'Contes',
            mountain_top: 'Montagne',
            rainbow: 'Arc-en-ciel',
            secret_base: 'Infiltration',
            toy_store: 'Jouets',
            university: 'Université',
            castle: 'Château',
            film_studio: 'Cinéma',
            funfair: 'Fête Foraine',
            haunted_house: 'Maison Hantée',
            outer_space: 'Espace',
            shipwreck: 'Épave',
            trainers: 'Entraîneurs',
            all: 'Toutes les Cartes'
        },
        print: {
            modalTitle: 'Impression et Exportation',
            modalSubtitleStandard: 'Format officiel A4 · 63,5 × 88 mm · Marge blanche 0,5 cm · 9 cartes par feuille',
            modalSubtitleStrips: 'Format bandes pour pochettes · 63,5 × 27,5 mm · 27 bandes par feuille A4 (3 × 9)',
            tabSelection: 'Sélection des cartes',
            tabFormat: 'Format de sortie',
            quickFiltersTitle: 'Filtres rapides de sélection :',
            btnAll: 'Toutes',
            btnFiltered: 'Filtres actuels',
            btnC1: 'Challengers 1',
            btnC2: 'Beach Cup',
            btnDeselect: 'Désélectionner',
            factionSelectTitle: 'Sélection par faction :',
            btnFactionsAll: 'Toutes',
            btnFactionsNone: 'Aucune',
            qtyDistTitle: 'Distribution des copies',
            presetOfficial: 'Copies du deck officiel',
            presetSingle: '1 par carte',
            metricUnique: 'Cartes uniques',
            metricPrintCopies: 'Copies à imprimer',
            metricSheets: 'Feuilles A4',
            specsLabelStandard: 'Spécifications :',
            specsDescStandard: '63,5 × 88 mm &bull; Marge blanche 0,5 cm &bull; Découpe droite',
            specsLabelStrips: 'Format bandes / inserts :',
            specsDescStrips: '63,5 × 27,5 mm &bull; 27 bandes par feuille A4 (3 × 9) &bull; Économie maximale',
            individualBreakdown: 'Détail et ajustement individuel',
            filterFactionLabel: 'Faction :',
            allFactionsOption: 'Toutes les factions',
            langLabel: 'Langue d\'impression',
            layoutLabel: 'Type de mise en page',
            layoutTemplateTitle: 'Modèle traduit',
            layoutTemplateBadge: 'Recommandé',
            layoutTemplateDesc: 'Carte complète avec typographie vectorielle nette et textes dans la langue choisie.',
            layoutBgaTitle: 'Numérique originale',
            layoutBgaDesc: 'Illustration découpée en haute définition telle qu\'affichée en numérique.',
            layoutStripsTitle: 'Bandes d\'insertion pour pochettes',
            layoutStripsDesc: 'Nom et effet (63,5 × 27,5 mm). 27 bandes par feuille pour pochettes opaques.',
            whiteMarginLabel: 'Marge périmétrique blanche (0,5 cm sur les 4 bords de chaque carte)',
            cutGuidesLabel: 'Guides de découpe',
            cutCrosses: 'Marques aux coins',
            cutGrid: 'Grille continue',
            cutNone: 'Sans guides',
            artAdjustLabel: 'Ajustement de l\'illustration',
            artFitLabel: 'Cadrage',
            artFitContain: 'Ajuster à l\'espace (complète sans recadrage)',
            artFitCover: 'Remplir la zone (recadrage automatique)',
            artFitHeight: 'Ajuster à la hauteur',
            artFitWidth: 'Ajuster à la largeur',
            downloadLabel: 'Télécharger :',
            btnDownloadPDFStandard: 'Modèle PDF',
            btnDownloadPDFStrips: 'PDF bandes (27/f)',
            btnDownloadImages: 'Cartes en image',
            btnPrintDirect: 'Imprimer dans le navigateur',
            previewTitle: 'Aperçu de la feuille A4',
            stripSampleLabel: 'Échantillon à l\'échelle réelle (bande d\'insertion) :',
            pageOf: (c, t) => `Page ${c} sur ${t}`,
            selectedPill: (count) => `${count} sélectionnées`,
            typesSuffix: 'types',
            cardsPhysicalSuffix: 'cartes physiques',
            stripsTextSuffix: 'bandes de texte',
            sheetsSuffix: (p, perPage) => `${p} feuille${p === 1 ? '' : 's'} A4 (${perPage} par feuille)`
        },
        manage: {
            modalTitle: 'Gestion du deck',
            modalSubtitle: 'Informations sur le deck actif et options disponibles',
            activeBadge: 'Deck actif dans le visualiseur',
            loadedCards: (count) => `${count} cartes chargées`,
            sectionCatalog: 'Bibliothèque de decks',
            sectionCatalogHint: 'Chargement direct ou téléchargement en .ZIP',
            btnLoad: 'Charger',
            btnInUse: '✓ Actif',
            btnChangePack: 'Charger un autre fichier .zip depuis votre appareil',
            btnChangePackSub: 'Glissez ou cliquez pour importer un deck personnalisé',
            btnChangePackBadge: 'Parcourir...',
            resourcesLabel: 'Ressources :',
            downloadTemplate: '📄 Modèle JSON',
            btnGuide: '📖 Guide créateurs',
            btnRemovePack: 'Supprimer le deck actif et revenir au début',
            confirmRemove: 'Voulez-vous supprimer le deck enregistré et revenir à l\'écran de chargement ?'
        },
        guide: {
            modalTitle: 'Guide de création de decks',
            modalSubtitle: 'Spécification du format et de la structure pour concevoir des decks compatibles',
            intro: 'Vous pouvez créer votre propre deck de cartes personnalisé avec vos propres illustrations, statistiques et effets. Le visualiseur l\'interprétera nativement, permettant de tourner les cartes en 3D et de les imprimer au format officiel.',
            treeTitle: 'Structure du fichier .zip',
            tableTitle: 'Champs de chaque carte dans cards.json',
            thField: 'Champ',
            thType: 'Type',
            thDesc: 'Valeurs valides et fonction',
            descId: 'Identifiant unique (ex : 1001 ou "carte_1").',
            descLevel: 'Fase ou set : "S" (Départ), "A", "B", "C", "Entraîneur" ou "R" (Robot).',
            descStrength: 'Force de base : de 1 à 10, "?" (force variable) ou "∞".',
            descSetId: 'Faction/ensemble (ex : "ma_faction", "city", etc.).',
            descCopies: 'Nombre de copies physiques dans le deck (ex : 1, 2, 4).',
            descArt: 'Nom du fichier image dans images/art_digital/.',
            descLocales: 'name : Nom de la carte. text : Effet ou texte descriptif.',
            ctaText: 'Vous voulez commencer directement avec un exemple fonctionnel ? Téléchargez le modèle avec des cartes configurées et prêtes à modifier.',
            downloadBtn: 'Télécharger plantilla_deck.json'
        },
        disclaimer: {
            modalTitle: 'Mentions Légales et Clause de Non-Responsabilité',
            modalSubtitle: 'Conditions d\'utilisation, exonération de responsabilité et droits d\'auteur',
            lead: 'Ce site est une ressource gratuite et sans but lucratif développée de manière indépendante pour permettre aux joueurs et créateurs de composer, visualiser et imprimer leurs propres cartes personnalisées.',
            sec1Title: '1. Aucune distribution de decks officiels',
            sec1Text: 'Cette application ne publie, n\'héberge ni ne commercialise de decks officiels protégés par le droit d\'auteur (comme les cartes originales de Challengers! ou les marques comme Pokémon). La plateforme fonctionne exclusivement comme un moteur de visualisation local dans le navigateur du client ; l\'utilisateur doit disposer et charger ses propres fichiers de deck créés pour son usage privé.',
            sec2Title: '2. Responsabilité exclusive de l\'utilisateur',
            sec2Text: 'Chaque utilisateur est le seul responsable des contenus, images, noms, logos et textes qu\'il décide d\'importer, de visualiser ou d\'exporter au format PDF à l\'aide de cet outil. Les développeurs ne sont pas responsables d\'une mauvaise utilisation de la plateforme, d\'éventuelles infractions aux droits de propriété intellectuelle découlant des fichiers chargés par les utilisateurs, ni de la reproduction non autorisée de matériel protégé.',
            sec3Title: '3. Marques déposées et propriété intellectuelle',
            sec3Text: 'Tous les noms de jeux, illustrations, marques déposées et éléments associés appartiennent à leurs auteurs, concepteurs et détenteurs de droits respectifs. Ce projet n\'est ni sponsorisé, ni affilié, ni approuvé par un éditeur ou détenteur de marque.',
            btnUnderstood: 'Compris'
        },
        onboarding: {
            title: 'Charger un deck de cartes',
            desc: 'Sélectionnez ou glissez un fichier compressé .zip contenant la base de données cards.json et les images du jeu.',
            dropText: 'Glissez et déposez votre fichier .zip ici',
            dropSubtext: 'ou cliquez pour explorer sur votre appareil',
            btnSelect: 'Sélectionner le fichier .zip'
        }
    },
    en: {
        subtitle: 'Interactive Card Database & High-Res Viewer',
        langLabel: 'Language:',
        filters: 'Filters',
        viewModeLabel: 'Mode:',
        templateMode: 'Template',
        photoMode: 'Original Card',
        searchPlaceholder: 'Search by card name, effect text or set...',
        resetFilters: 'Reset',
        flipAll: 'Flip cards',
        flipCard: 'Flip card (Rotate 180°)',
        viewDetail: 'View card details',
        headerFlipAll: 'Flip cards',
        headerPrint: 'Print',
        headerDeck: 'Deck',
        footerBrand: 'Challengers Card Maker',
        footerDesc: 'Community tool for custom cards',
        footerDisclaimer: 'Disclaimer',
        footerScrollTop: 'Back to top ↑',
        loadingTitle: 'Loading deck...',
        loadingStatus: 'Extracting cards and artwork...',
        filterGameTitle: 'Version:',
        filterColorTitle: 'Factions:',
        filterLevelTitle: 'Set:',
        filterStrengthTitle: 'Strength:',
        countLabel: 'visible cards',
        visibleCopiesSuffix: 'total copies',
        noResultsTitle: 'No cards found',
        noResultsText: 'Try changing the filters or search keywords.',
        btnReset: 'Reset filters',
        all: 'All',
        strengthSpecial: 'Special',
        emptyText: '(No special effect text)',
        modalTabTemplate: 'Generated Template',
        modalTabPhoto: 'Digital / Original Card',
        modalGame: 'Version',
        modalFaction: 'Faction',
        modalType: 'Type / Icon',
        modalLevel: 'Set',
        modalStrength: 'Strength',
        modalSource: 'Source Image',
        starterDeckLabel: 'Starter Deck (8 Tournament Variants)',
        starterCopiesText: (perPlayer, total) => `${perPlayer}x per player (${total} total)`,
        starterDescText: 'This card has 8 physical versions, one for each tournament player icon:',
        modalFlipBtnText: 'Flip card (3D)',
        modalNavPrev: 'Previous',
        modalNavNext: 'Next',
        modalClose: 'Close',
        factionHeaderSummary: (count, copies) => `${count} cards • ${copies} copies in deck`,
        games: {
            all: 'All',
            c1: 'Challengers! 1',
            c2: 'Beach Cup'
        },
        levelLabels: {
            all: 'All Sets',
            A: 'Level A',
            B: 'Level B',
            C: 'Level C',
            S: 'Starter Deck',
            Entraîneur: 'Trainers',
            SOLO: 'Solo Mode',
            R: 'Robot'
        },
        colors: {
            all: 'All Factions',
            city: 'City',
            beach_club: 'Beach Club',
            fairytale_forest: 'Fairytale Forest',
            mountain_top: 'Mountain Top',
            rainbow: 'Rainbow',
            secret_base: 'Secret Base',
            toy_store: 'Toy Store',
            university: 'University',
            castle: 'Castle',
            film_studio: 'Film Studio',
            funfair: 'Funfair',
            haunted_house: 'Haunted House',
            outer_space: 'Outer Space',
            shipwreck: 'Shipwreck',
            trainers: 'Trainers',
            robot: 'Robot',
            cyan: 'City',
            vert: 'Beach Club',
            violet: 'Fairytale Forest',
            rose: 'Mountain Top',
            multicolor: 'Rainbow',
            marron: 'Secret Base',
            jaune: 'Toy Store',
            universite: 'University',
            chateau: 'Castle',
            cinema: 'Film Studio',
            foire: 'Funfair',
            hantee: 'Haunted House',
            espace: 'Outer Space',
            epave: 'Shipwreck',
            noir: 'Trainers',
            gris: 'Robot'
        },
        factionTabNames: {
            starter: 'Starter Decks',
            robot: 'Robot Deck',
            city: 'Base Set (City)',
            beach_club: 'Beach Club',
            fairytale_forest: 'Fairytale Forest',
            mountain_top: 'Mountain Top',
            rainbow: 'Rainbow',
            secret_base: 'Secret Base',
            toy_store: 'Toy Store',
            university: 'University',
            castle: 'Castle',
            film_studio: 'Film Studio',
            funfair: 'Funfair',
            haunted_house: 'Haunted House',
            outer_space: 'Outer Space',
            shipwreck: 'Shipwreck',
            trainers: 'Trainers',
            all: 'All Cards'
        },
        print: {
            modalTitle: 'Print & Export',
            modalSubtitleStandard: 'Official A4 format · 63.5 × 88 mm · 0.5 cm white margin · 9 cards per sheet',
            modalSubtitleStrips: 'Sleeve insert format · 63.5 × 27.5 mm · 27 strips per A4 sheet (3 × 9)',
            tabSelection: 'Card Selection',
            tabFormat: 'Output Format',
            quickFiltersTitle: 'Quick selection filters:',
            btnAll: 'All',
            btnFiltered: 'Current filtered',
            btnC1: 'Challengers 1',
            btnC2: 'Beach Cup',
            btnDeselect: 'Deselect',
            factionSelectTitle: 'Faction selection:',
            btnFactionsAll: 'All',
            btnFactionsNone: 'None',
            qtyDistTitle: 'Copy distribution',
            presetOfficial: 'Official deck copies',
            presetSingle: '1 per card',
            metricUnique: 'Unique cards',
            metricPrintCopies: 'Copies to print',
            metricSheets: 'A4 Sheets',
            specsLabelStandard: 'Official specifications:',
            specsDescStandard: '63.5 × 88 mm &bull; 0.5 cm white margin &bull; Straight cut corners',
            specsLabelStrips: 'Sleeve insert format:',
            specsDescStrips: '63.5 × 27.5 mm &bull; 27 strips per A4 sheet (3 × 9) &bull; Maximum ink and paper savings',
            individualBreakdown: 'Individual breakdown & adjust',
            filterFactionLabel: 'Faction:',
            allFactionsOption: 'All factions',
            langLabel: 'Print language',
            layoutLabel: 'Layout type',
            layoutTemplateTitle: 'Translated template',
            layoutTemplateBadge: 'Recommended',
            layoutTemplateDesc: 'Full card with crisp vector typography and texts in the selected language.',
            layoutBgaTitle: 'Original digital',
            layoutBgaDesc: 'High-definition artwork as displayed digitally.',
            layoutStripsTitle: 'Sleeve insert strips',
            layoutStripsDesc: 'Name and effect (63.5 × 27.5 mm). 27 strips per sheet for opaque sleeves.',
            whiteMarginLabel: 'White perimeter margin (0.5 cm on all 4 edges of each card)',
            cutGuidesLabel: 'Cutting guides',
            cutCrosses: 'Corner crop marks',
            cutGrid: 'Continuous grid',
            cutNone: 'No guides',
            artAdjustLabel: 'Artwork adjustment',
            artFitLabel: 'Fit',
            artFitContain: 'Fit to space (full, uncropped)',
            artFitCover: 'Fill area (auto crop)',
            artFitHeight: 'Fit to height',
            artFitWidth: 'Fit to width',
            downloadLabel: 'Download:',
            btnDownloadPDFStandard: 'PDF Template',
            btnDownloadPDFStrips: 'Strips PDF (27/sheet)',
            btnDownloadImages: 'Cards as images',
            btnPrintDirect: 'Print in browser',
            previewTitle: 'A4 Sheet Preview',
            stripSampleLabel: 'Real-size sample (insert strip):',
            pageOf: (c, t) => `Page ${c} of ${t}`,
            selectedPill: (count) => `${count} selected`,
            typesSuffix: 'types',
            cardsPhysicalSuffix: 'physical cards',
            stripsTextSuffix: 'text strips',
            sheetsSuffix: (p, perPage) => `${p} A4 sheet${p === 1 ? '' : 's'} (${perPage} per sheet)`
        },
        manage: {
            modalTitle: 'Deck Management',
            modalSubtitle: 'Active deck info and available options',
            activeBadge: 'Active deck in viewer',
            loadedCards: (count) => `${count} cards loaded`,
            sectionCatalog: 'Deck Library',
            sectionCatalogHint: 'Direct load or download as .ZIP',
            btnLoad: 'Load',
            btnInUse: '✓ In use',
            btnChangePack: 'Load another .zip file from device',
            btnChangePackSub: 'Drag or click to import a custom deck',
            btnChangePackBadge: 'Browse...',
            resourcesLabel: 'Resources:',
            downloadTemplate: '📄 JSON Template',
            btnGuide: '📖 Creator guide',
            btnRemovePack: 'Remove active deck and return to start',
            confirmRemove: 'Do you want to remove the saved deck and return to the upload screen?'
        },
        guide: {
            modalTitle: 'Deck Creation Guide',
            modalSubtitle: 'Format and structure specifications for compatible decks',
            intro: 'You can create your own custom card deck with your own illustrations, stats, and effects. The viewer natively supports it, allowing 3D card flips and official tournament-ready printing.',
            treeTitle: '.zip File Structure',
            tableTitle: 'Card Fields in cards.json',
            thField: 'Field',
            thType: 'Type',
            thDesc: 'Valid values and description',
            descId: 'Unique identifier (e.g. 1001 or "card_1").',
            descLevel: 'Phase or set: "S" (Starter), "A", "B", "C", "Entraîneur" (Trainer) or "R" (Robot).',
            descStrength: 'Base strength: 1 to 10, "?" (variable strength) or "∞".',
            descSetId: 'Faction/set (e.g. "my_faction", "city", etc.).',
            descCopies: 'Number of physical copies in deck (e.g. 1, 2, 4).',
            descArt: 'Image filename in images/art_digital/.',
            descLocales: 'name: Card name. text: Ability effect or descriptive text.',
            ctaText: 'Want to start right away with a working example? Download the template with pre-configured JSON structure ready to edit.',
            downloadBtn: 'Download plantilla_deck.json'
        },
        disclaimer: {
            modalTitle: 'Legal Disclaimer & Terms of Use',
            modalSubtitle: 'Terms of use, liability waiver, and intellectual property notice',
            lead: 'This website is a free, non-profit community resource developed independently to allow players and creators to design, view, and print their own custom cards.',
            sec1Title: '1. No distribution of official decks',
            sec1Text: 'This application does not publish, host, or commercialize copyrighted official decks (such as original Challengers! cards or registered trademarks like Pokémon). The platform operates exclusively as a local client-side viewer in the user\'s browser; users must provide and load their own generated deck files for private use.',
            sec2Title: '2. Exclusive user responsibility',
            sec2Text: 'Each user is solely responsible for the contents, images, names, logos, and texts they import, view, or export to PDF using this tool. The developers assume no liability for misuse of the platform, potential intellectual property infringements arising from files loaded by users, or unauthorized reproduction of protected materials.',
            sec3Title: '3. Trademarks and ownership',
            sec3Text: 'All game titles, illustrations, trademarks, and associated assets belong to their respective creators, publishers, and rights holders. This project is not sponsored, affiliated with, or endorsed by any publisher or brand owner.',
            btnUnderstood: 'Understood'
        },
        onboarding: {
            title: 'Load Card Deck',
            desc: 'Select or drag a compressed .zip file containing the cards.json database and game images.',
            dropText: 'Drag and drop your .zip file here',
            dropSubtext: 'or click to browse on your device',
            btnSelect: 'Select .zip file'
        }
    },
    de: {
        subtitle: "Interaktiver Betrachter und offizielle Kartendatenbank",
        langLabel: "Sprache:",
        filters: "Filter",
        viewModeLabel: "Modus:",
        templateMode: "Vorlage",
        photoMode: "Originalkarte",
        searchPlaceholder: "Nach Name, Text, Effekt oder Fraktion suchen...",
        resetFilters: "Zurücksetzen",
        flipAll: "Karten umdrehen",
        flipCard: "Karte umdrehen (180°)",
        viewDetail: "Kartendetails anzeigen",
        headerFlipAll: "Karten umdrehen",
        headerPrint: "Drucken",
        headerDeck: "Deck",
        footerBrand: "Challengers Card Maker",
        footerDesc: "Community-Tool für personalisierte Karten",
        footerDisclaimer: "Haftungsausschluss",
        footerScrollTop: "Nach oben ↑",
        loadingTitle: "Deck wird geladen...",
        loadingStatus: "Karten und Illustrationen werden geladen...",
        filterGameTitle: "Version:",
        filterColorTitle: "Fraktionen:",
        filterLevelTitle: "Set:",
        filterStrengthTitle: "Stärke:",
        countLabel: "sichtbare Karten",
        visibleCopiesSuffix: "Exemplare insgesamt",
        noResultsTitle: "Keine Karten gefunden",
        noResultsText: "Versuchen Sie, die Filter oder Suchbegriffe anzupassen.",
        btnReset: "Filter zurücksetzen",
        all: "Alle",
        strengthSpecial: "Spezial",
        emptyText: "(Kein Spezialeffekttext)",
        modalTabTemplate: "Generierte Vorlage",
        modalTabPhoto: "Digitale Karte / Originalfoto",
        modalGame: "Version",
        modalFaction: "Fraktion",
        modalType: "Typ / Symbol",
        modalLevel: "Set",
        modalStrength: "Stärke",
        modalSource: "Quellbild",
        starterDeckLabel: "Startdeck (8 Turnier-Varianten)",
        starterCopiesText: (perPlayer, total) => `${perPlayer}x pro Spieler (${total} insgesamt)`,
        starterDescText: "Diese Karte hat 8 physische Versionen, eine für jedes Turniersymbol:",
        modalFlipBtnText: "Karte umdrehen (3D)",
        modalNavPrev: "Vorherige",
        modalNavNext: "Nächste",
        modalClose: "Schließen",
        factionHeaderSummary: (count, copies) => `${count} Karten • ${copies} Exemplare im Deck`,
        games: {
            all: "Alle",
            c1: "Challengers! 1",
            c2: "Beach Cup"
        },
        levelLabels: {
            all: "Alle Sets",
            A: "Stufe A",
            B: "Stufe B",
            C: "Stufe C",
            S: "Startdeck",
            "Entraîneur": "Trainer",
            SOLO: "Solo-Modus",
            R: "Roboter"
        },
        colors: {
            all: "Alle Fraktionen",
            city: "Stadt",
            beach_club: "Strandclub",
            fairytale_forest: "Märchenwald",
            mountain_top: "Berggipfel",
            rainbow: "Regenbogen",
            secret_base: "Geheimbasis",
            toy_store: "Spielzeugladen",
            university: "Universität",
            castle: "Burg",
            film_studio: "Filmstudio",
            funfair: "Kirmes",
            haunted_house: "Geisterhaus",
            outer_space: "Weltraum",
            shipwreck: "Schiffswrack",
            trainers: "Trainer",
            robot: "Roboter",
            cyan: "Stadt",
            vert: "Strandclub",
            violet: "Märchenwald",
            rose: "Berggipfel",
            multicolor: "Regenbogen",
            marron: "Geheimbasis",
            jaune: "Spielzeugladen",
            universite: "Universität",
            chateau: "Burg",
            cinema: "Filmstudio",
            foire: "Kirmes",
            hantee: "Geisterhaus",
            espace: "Weltraum",
            epave: "Schiffswrack",
            noir: "Trainer",
            gris: "Roboter"
        },
        factionTabNames: {
            starter: "Startdecks",
            robot: "Roboter-Deck",
            city: "Basis-Set (Stadt)",
            beach_club: "Strandclub",
            fairytale_forest: "Märchenwald",
            mountain_top: "Berggipfel",
            rainbow: "Regenbogen",
            secret_base: "Geheimbasis",
            toy_store: "Spielzeugladen",
            university: "Universität",
            castle: "Burg",
            film_studio: "Filmstudio",
            funfair: "Kirmes",
            haunted_house: "Geisterhaus",
            outer_space: "Weltraum",
            shipwreck: "Schiffswrack",
            trainers: "Trainer",
            all: "Alle Karten"
        },
        print: {
            modalTitle: "Drucken & Exportieren",
            modalSubtitleStandard: "Offizielle P&P-Bögen mit Standardkarten (63x88mm)",
            modalSubtitleStrips: "Dünne Textstreifen zum Einfügen in Hüllen über Originalkarten",
            tabSelection: "1. Kartenauswahl",
            tabFormat: "2. Format & Layout",
            quickFiltersTitle: "Schnellauswahl:",
            btnAll: "Alle Karten",
            btnFiltered: "Aktuell gefiltert",
            btnC1: "Nur Challengers! 1",
            btnC2: "Nur Beach Cup",
            btnDeselect: "Alles abwählen",
            factionSelectTitle: "Fraktionen auswählen:",
            btnFactionsAll: "Alle auswählen",
            btnFactionsNone: "Keine auswählen",
            qtyDistTitle: "Exemplarverteilung:",
            presetOfficial: "Offiziell (nach Box-Exemplaren)",
            presetSingle: "1 Exemplar von jedem Modell",
            metricUnique: "Einzigartige Modelle",
            metricPrintCopies: "Zu druckende Exemplare",
            metricSheets: "A4-Bögen benötigt",
            specsLabelStandard: "Spezifikationen:",
            specsDescStandard: "A4-Format, 3x3 Raster (9 Karten pro Bogen). Standardgröße 63x88mm.",
            specsLabelStrips: "Spezifikationen:",
            specsDescStrips: "A4-Format, 4 Spalten mit Textstreifen (24 pro Bogen) zum Einstecken in Kartenhüllen.",
            individualBreakdown: "Individuelle Kartenauswahl:",
            filterFactionLabel: "Nach Fraktion filtern:",
            allFactionsOption: "Alle Fraktionen",
            langLabel: "Drucksprache:",
            layoutLabel: "Layout-Typ:",
            layoutTemplateTitle: "Druckvorlage (P&P)",
            layoutTemplateBadge: "Empfohlen",
            layoutTemplateDesc: "Grafische Vorlage mit Rand, Farben und Icons.",
            layoutBgaTitle: "Originale / Digitale Fotos",
            layoutBgaDesc: "Originalkarten aus der digitalen Version.",
            layoutStripsTitle: "Textstreifen für Hüllen",
            layoutStripsDesc: "Dünne Textstreifen zum Einlegen in Hüllen.",
            whiteMarginLabel: "Weißer Rand um jede Karte hinzufügen (einfacheres Schneiden)",
            cutGuidesLabel: "Schnittmarken:",
            cutCrosses: "Schnittkreuze an Ecken",
            cutGrid: "Vollständiges Schnittgitter",
            cutNone: "Keine Schnittmarken",
            artAdjustLabel: "Bildanpassung (Originalfotos):",
            artFitLabel: "Modus:",
            artFitContain: "Vollständig einpassen (Contain)",
            artFitCover: "Fläche füllen (Cover)",
            artFitHeight: "An Höhe anpassen",
            artFitWidth: "An Breite anpassen",
            downloadLabel: "Generieren & Exportieren:",
            btnDownloadPDFStandard: "Standard-A4-PDF herunterladen",
            btnDownloadPDFStrips: "Streifen-PDF herunterladen",
            btnDownloadImages: "Bögen als PNG herunterladen (.zip)",
            btnPrintDirect: "Direkt drucken",
            previewTitle: "Druckvorschau:",
            stripSampleLabel: "Streifenvorschau:",
            pageOf: (cur, tot) => `Seite ${cur} von ${tot}`,
            selectedPill: (sel, tot) => `${sel} von ${tot} ausgewählt`,
            typesSuffix: "Modelle",
            cardsPhysicalSuffix: "Karten",
            stripsTextSuffix: "Streifen",
            sheetsSuffix: "A4-Bögen"
        },
        manage: {
            modalTitle: "Deck-Verwaltung",
            modalSubtitle: "Laden oder wechseln Sie das Kartendeck im Betrachter",
            activeBadge: "Aktives Deck",
            loadedCards: (count, factions) => `${count} geladene Karten in ${factions} Fraktionen`,
            sectionCatalog: "Deck-Katalog",
            sectionCatalogHint: "Wählen Sie ein vorkonfiguriertes Deck aus oder laden Sie Ihre eigene .zip-Datei hoch",
            btnLoad: "Laden",
            btnInUse: "✓ In Verwendung",
            btnChangePack: "Deck (.zip) laden",
            btnChangePackSub: "Ziehen Sie eine .zip-Datei hierher oder klicken Sie zum Auswählen",
            btnChangePackBadge: "Lokale Datei",
            resourcesLabel: "Ressourcen für Ersteller",
            downloadTemplate: "Basispaket-Vorlage (.zip)",
            btnGuide: "Spezifikationsanleitung",
            btnRemovePack: "Eigenes Deck entfernen und zum Standard zurückkehren",
            confirmRemove: "Möchten Sie das benutzerdefinierte Deck wirklich entfernen und zum Standardspiel zurückkehren?"
        },
        guide: {
            modalTitle: "Deck-Spezifikationsanleitung",
            modalSubtitle: "Format und Dateistruktur für benutzerdefinierte Challengers!-Decks",
            intro: "Benutzerdefinierte Decks werden als .zip-Dateien mit folgender Struktur verpackt:",
            treeTitle: "Erwartete Ordnerstruktur",
            tableTitle: "Felder in cards.json",
            thField: "Feld",
            thType: "Typ",
            thDesc: "Beschreibung",
            descId: "Eindeutige Kartennummer",
            descLevel: "Stufe: A, B, C, S (Start) oder R (Roboter)",
            descStrength: "Basisstärke oder \"?\"",
            descSetId: "Fraktionskennung (z.B. castle, city)",
            descCopies: "Anzahl der physischen Exemplare im Deck",
            descArt: "Dateiname des Artworks in images/art_digital/",
            descLocales: "Objekt mit Texten in es, en, fr, de, nl, it",
            ctaText: "Laden Sie die leere Vorlage herunter, um Ihr eigenes Deck zu erstellen:",
            downloadBtn: "Basispaket-Vorlage (.zip) herunterladen"
        },
        disclaimer: {
            modalTitle: "Rechtlicher Hinweis & Anerkennungen",
            modalSubtitle: "Informationen zu geistigem Eigentum und Nutzung",
            lead: "Challengers! ist ein geschütztes Spiel, entworfen von Johannes Krenner und Markus Slawitscheck, veröffentlicht von 1 More Castle Games und Z-Man Games.",
            sec1Title: "Nichtkommerzielle Nutzung",
            sec1Text: "Dieser Betrachter ist ein kostenloses, von Fans erstelltes Tool ausschließlich für den privaten, nichtkommerziellen Gebrauch.",
            sec2Title: "Urheberrechte",
            sec2Text: "Alle Bildrechte, Marken und Logos gehören ihren jeweiligen Eigentümern.",
            sec3Title: "Datenschutz & Sicherheit",
            sec3Text: "Alle Deck-Dateien werden zu 100% lokal im Browser verarbeitet. Es werden keine Daten an externe Server übertragen.",
            btnUnderstood: "Verstanden"
        },
        onboarding: {
            title: "Deck (.zip) laden",
            desc: "Laden Sie ein Challengers!-Kartendeck als ZIP-Datei hoch, um Karten zu betrachten, zu filtern und zu drucken.",
            dropText: "ZIP-Datei hierher ziehen",
            dropSubtext: "oder klicken Sie, um eine Datei von Ihrem Gerät auszuwählen",
            btnSelect: "ZIP-Datei auswählen",
            demoHint: "Oder starten Sie mit einem vorkonfigurierten Deck:",
            btnDemoBase: "Challengers! 1 (Basisspiel)",
            btnDemoBeach: "Challengers! 2 (Beach Cup)",
            btnDemoC1: "Challengers! 1 + 2 (Komplett)",
            btnDemoPokemon: "Pokémon Edition (Re-Theme)",
            templatesTitle: "Ressourcen & Vorlagen",
            templatesDesc: "Fertige Dateien und Grundlagen für eigene Karten:",
            btnBaseZip: "Basisspiel (.zip)",
            btnBeachZip: "Beach Cup (.zip)",
            btnPokemonZip: "Pokémon Deck (.zip)",
            btnTemplateZip: "Basispaket-Vorlage (.zip)",
            btnGuide: "Spezifikationsanleitung",
            structureTitle: "Erwartete Struktur",
            privacy: "Sichere Verarbeitung: Die Datei wird zu 100% lokal in Ihrem Browser entpackt und verarbeitet. Keine Daten verlassen Ihren Computer."
        }
    },
    nl: {
        subtitle: "Interactieve Kaartenviewer & Officiële Database",
        langLabel: "Taal:",
        filters: "Filters",
        viewModeLabel: "Modus:",
        templateMode: "Sjabloon",
        photoMode: "Originele Kaart",
        searchPlaceholder: "Zoek op naam, tekst, effect of factie...",
        resetFilters: "Herstellen",
        flipAll: "Kaarten omdraaien",
        flipCard: "Kaart omdraaien (180°)",
        viewDetail: "Kaartdetails bekijken",
        headerFlipAll: "Kaarten omdraaien",
        headerPrint: "Afdrukken",
        headerDeck: "Deck",
        footerBrand: "Challengers Card Maker",
        footerDesc: "Community-tool voor gepersonaliseerde kaarten",
        footerDisclaimer: "Disclaimer",
        footerScrollTop: "Naar boven ↑",
        loadingTitle: "Deck laden...",
        loadingStatus: "Kaarten en illustraties worden geladen...",
        filterGameTitle: "Versie:",
        filterColorTitle: "Facties:",
        filterLevelTitle: "Set:",
        filterStrengthTitle: "Kracht:",
        countLabel: "zichtbare kaarten",
        visibleCopiesSuffix: "exemplaren in totaal",
        noResultsTitle: "Geen kaarten gevonden",
        noResultsText: "Probeer de filters of zoektermen aan te passen.",
        btnReset: "Filters herstellen",
        all: "Alle",
        strengthSpecial: "Speciaal",
        emptyText: "(Geen speciaal effecttekst)",
        modalTabTemplate: "Gegenereerd Sjabloon",
        modalTabPhoto: "Digitale Kaart / Originele Foto",
        modalGame: "Versie",
        modalFaction: "Factie",
        modalType: "Type / Icoon",
        modalLevel: "Set",
        modalStrength: "Kracht",
        modalSource: "Bronafbeelding",
        starterDeckLabel: "Startdeck (8 Toernooivarianten)",
        starterCopiesText: (perPlayer, total) => `${perPlayer}x per speler (${total} in totaal)`,
        starterDescText: "Deze kaart heeft 8 fysieke versies, één voor elk spelersicoon van het toernooi:",
        modalFlipBtnText: "Kaart omdraaien (3D)",
        modalNavPrev: "Vorige",
        modalNavNext: "Volgende",
        modalClose: "Sluiten",
        factionHeaderSummary: (count, copies) => `${count} kaarten • ${copies} exemplaren in deck`,
        games: {
            all: "Alle",
            c1: "Challengers! 1",
            c2: "Beach Cup"
        },
        levelLabels: {
            all: "Alle Sets",
            A: "Niveau A",
            B: "Niveau B",
            C: "Niveau C",
            S: "Startdeck",
            "Entraîneur": "Trainers",
            SOLO: "Solo Modus",
            R: "Robot"
        },
        colors: {
            all: "Alle Facties",
            city: "Stad",
            beach_club: "Strandclub",
            fairytale_forest: "Sprookjesbos",
            mountain_top: "Bergtop",
            rainbow: "Regenboog",
            secret_base: "Geheime Basis",
            toy_store: "Speelgoedwinkel",
            university: "Universiteit",
            castle: "Kasteel",
            film_studio: "Filmstudio",
            funfair: "Kermis",
            haunted_house: "Spookhuis",
            outer_space: "Ruimte",
            shipwreck: "Scheepswrak",
            trainers: "Trainers",
            robot: "Robot",
            cyan: "Stad",
            vert: "Strandclub",
            violet: "Sprookjesbos",
            rose: "Bergtop",
            multicolor: "Regenboog",
            marron: "Geheime Basis",
            jaune: "Speelgoedwinkel",
            universite: "Universiteit",
            chateau: "Kasteel",
            cinema: "Filmstudio",
            foire: "Kermis",
            hantee: "Spookhuis",
            espace: "Ruimte",
            epave: "Scheepswrak",
            noir: "Trainers",
            gris: "Robot"
        },
        factionTabNames: {
            starter: "Startdecks",
            robot: "Robotdeck",
            city: "Basisset (Stad)",
            beach_club: "Strandclub",
            fairytale_forest: "Sprookjesbos",
            mountain_top: "Bergtop",
            rainbow: "Regenboog",
            secret_base: "Geheime Basis",
            toy_store: "Speelgoedwinkel",
            university: "Universiteit",
            castle: "Kasteel",
            film_studio: "Filmstudio",
            funfair: "Kermis",
            haunted_house: "Spookhuis",
            outer_space: "Ruimte",
            shipwreck: "Scheepswrak",
            trainers: "Trainers",
            all: "Alle Kaarten"
        },
        print: {
            modalTitle: "Afdrukken & Exporteren",
            modalSubtitleStandard: "Officiële P&P-vellen met standaardkaarten (63x88mm)",
            modalSubtitleStrips: "Dunne tekststroken voor insteekhoezen over originele kaarten",
            tabSelection: "1. Kaartselectie",
            tabFormat: "2. Formaat & Indeling",
            quickFiltersTitle: "Snelselectie:",
            btnAll: "Alle kaarten",
            btnFiltered: "Momenteel gefilterd",
            btnC1: "Alleen Challengers! 1",
            btnC2: "Alleen Beach Cup",
            btnDeselect: "Alles deselecteren",
            factionSelectTitle: "Facties selecteren:",
            btnFactionsAll: "Alles selecteren",
            btnFactionsNone: "Niets selecteren",
            qtyDistTitle: "Aantaldistributie:",
            presetOfficial: "Officieel (volgens doosverdeling)",
            presetSingle: "1 exemplaar van elk model",
            metricUnique: "Unieke modellen",
            metricPrintCopies: "Af te drukken exemplaren",
            metricSheets: "Benodigde A4-vellen",
            specsLabelStandard: "Specificaties:",
            specsDescStandard: "A4-formaat, 3x3 raster (9 kaarten per vel). Standaardformaat 63x88mm.",
            specsLabelStrips: "Specificaties:",
            specsDescStrips: "A4-formaat, 4 kolommen met tekststroken (24 per vel) voor insteekhoezen.",
            individualBreakdown: "Individuele kaartselectie:",
            filterFactionLabel: "Filter op factie:",
            allFactionsOption: "Alle facties",
            langLabel: "Afdruktaal:",
            layoutLabel: "Lay-outtype:",
            layoutTemplateTitle: "Afdruksjabloon (P&P)",
            layoutTemplateBadge: "Aanbevolen",
            layoutTemplateDesc: "Grafisch sjabloon met rand, kleuren en iconen.",
            layoutBgaTitle: "Originele / Digitale foto's",
            layoutBgaDesc: "Originele kaarten uit de digitale versie.",
            layoutStripsTitle: "Tekststroken voor hoezen",
            layoutStripsDesc: "Dunne tekststroken om in hoezen te schuiven.",
            whiteMarginLabel: "Witte rand toevoegen rond elke kaart (makkelijker knippen)",
            cutGuidesLabel: "Snijlijnen:",
            cutCrosses: "Snijkruizen op hoeken",
            cutGrid: "Volledig snijraster",
            cutNone: "Geen snijlijnen",
            artAdjustLabel: "Beeldaanpassing (originele foto's):",
            artFitLabel: "Modus:",
            artFitContain: "Volledig inpassen (Contain)",
            artFitCover: "Oppervlak vullen (Cover)",
            artFitHeight: "Aanpassen aan hoogte",
            artFitWidth: "Aanpassen aan breedte",
            downloadLabel: "Genereren & Exporteren:",
            btnDownloadPDFStandard: "Standaard A4 PDF downloaden",
            btnDownloadPDFStrips: "Stroken PDF downloaden",
            btnDownloadImages: "Vellen downloaden als PNG (.zip)",
            btnPrintDirect: "Direct afdrukken",
            previewTitle: "Afdrukvoorbeeld:",
            stripSampleLabel: "Voorbeeld strook:",
            pageOf: (cur, tot) => `Pagina ${cur} van ${tot}`,
            selectedPill: (sel, tot) => `${sel} van ${tot} geselecteerd`,
            typesSuffix: "modellen",
            cardsPhysicalSuffix: "kaarten",
            stripsTextSuffix: "stroken",
            sheetsSuffix: "A4-vellen"
        },
        manage: {
            modalTitle: "Deckbeheer",
            modalSubtitle: "Laad of wissel het kaartendeck in de viewer",
            activeBadge: "Actief deck",
            loadedCards: (count, factions) => `${count} geladen kaarten in ${factions} facties`,
            sectionCatalog: "Deckcatalogus",
            sectionCatalogHint: "Kies een vooraf geconfigureerd deck of upload uw eigen .zip-bestand",
            btnLoad: "Laden",
            btnInUse: "✓ In gebruik",
            btnChangePack: "Deck (.zip) laden",
            btnChangePackSub: "Sleep een .zip-bestand hierheen of klik om te selecteren",
            btnChangePackBadge: "Lokaal bestand",
            resourcesLabel: "Makersbronnen",
            downloadTemplate: "Basissjabloon (.zip)",
            btnGuide: "Specificatiegids",
            btnRemovePack: "Aangepast deck verwijderen en terugkeren naar standaard",
            confirmRemove: "Weet u zeker dat u het aangepaste deck wilt verwijderen en wilt terugkeren naar het basisspel?"
        },
        guide: {
            modalTitle: "Deckspecificatiegids",
            modalSubtitle: "Formaat en bestandsstructuur voor aangepaste Challengers!-decks",
            intro: "Aangepaste decks worden verpakt als .zip-bestanden met de volgende structuur:",
            treeTitle: "Verwachte mapstructuur",
            tableTitle: "Velden in cards.json",
            thField: "Veld",
            thType: "Type",
            thDesc: "Beschrijving",
            descId: "Uniek kaartnummer",
            descLevel: "Niveau: A, B, C, S (Start) of R (Robot)",
            descStrength: "Basiskracht of \"?\"",
            descSetId: "Factie-ID (bijv. castle, city)",
            descCopies: "Aantal fysieke exemplaren in het deck",
            descArt: "Bestandsnaam van artwork in images/art_digital/",
            descLocales: "Object met teksten in es, en, fr, de, nl, it",
            ctaText: "Download het lege basissjabloon om uw eigen deck te maken:",
            downloadBtn: "Basissjabloon (.zip) downloaden"
        },
        disclaimer: {
            modalTitle: "Juridische Kennisgeving & Erkenningen",
            modalSubtitle: "Informatie over intellectueel eigendom en gebruik",
            lead: "Challengers! is een geregistreerd spel ontworpen door Johannes Krenner en Markus Slawitscheck, uitgegeven door 1 More Castle Games en Z-Man Games.",
            sec1Title: "Niet-commercieel gebruik",
            sec1Text: "Deze viewer is een gratis, door fans gemaakte tool, uitsluitend bedoeld voor privé, niet-commercieel gebruik.",
            sec2Title: "Auteursrechten",
            sec2Text: "Alle beeldrechten, handelsmerken en logo's zijn eigendom van hun respectievelijke eigenaren.",
            sec3Title: "Privacy & Veiligheid",
            sec3Text: "Alle deckbestanden worden 100% lokaal in uw browser verwerkt. Er worden geen gegevens naar externe servers gestuurd.",
            btnUnderstood: "Begrepen"
        },
        onboarding: {
            title: "Deck (.zip) laden",
            desc: "Upload een Challengers!-kaartendeck in ZIP-formaat om kaarten te bekijken, te filteren en af te drukken.",
            dropText: "Sleep het ZIP-bestand hierheen",
            dropSubtext: "of klik om een bestand vanaf uw apparaat te selecteren",
            btnSelect: "ZIP-bestand selecteren",
            demoHint: "Of begin met een vooraf geconfigureerd deck:",
            btnDemoBase: "Challengers! 1 (Basisspel)",
            btnDemoBeach: "Challengers! 2 (Beach Cup)",
            btnDemoC1: "Challengers! 1 + 2 (Compleet)",
            btnDemoPokemon: "Pokémon Editie (Re-Theme)",
            templatesTitle: "Bronnen & Sjablonen",
            templatesDesc: "Klaar-voor-gebruik bestanden en bases voor aangepaste kaarten:",
            btnBaseZip: "Basisspel (.zip)",
            btnBeachZip: "Beach Cup (.zip)",
            btnPokemonZip: "Pokémon Deck (.zip)",
            btnTemplateZip: "Basissjabloon (.zip)",
            btnGuide: "Specificatiegids",
            structureTitle: "Verwachte structuur",
            privacy: "Veilige verwerking: Het bestand wordt 100% lokaal in uw browser uitgepakt en verwerkt. Er verlaat geen data uw computer."
        }
    },
    it: {
        subtitle: "Visualizzatore Interattivo e Database Ufficiale delle Carte",
        langLabel: "Lingua:",
        filters: "Filtri",
        viewModeLabel: "Modalità:",
        templateMode: "Modello",
        photoMode: "Carta Originale",
        searchPlaceholder: "Cerca per nome, testo, effetto o fazione...",
        resetFilters: "Ripristina",
        flipAll: "Gira carte",
        flipCard: "Gira carta (180°)",
        viewDetail: "Vedi dettagli carta",
        headerFlipAll: "Gira carte",
        headerPrint: "Stampa",
        headerDeck: "Mazzo",
        footerBrand: "Challengers Card Maker",
        footerDesc: "Strumento della community per carte personalizzate",
        footerDisclaimer: "Disclaimer",
        footerScrollTop: "Torna su ↑",
        loadingTitle: "Caricamento mazzo...",
        loadingStatus: "Lettura carte e illustrazioni in corso...",
        filterGameTitle: "Versione:",
        filterColorTitle: "Fazioni:",
        filterLevelTitle: "Set:",
        filterStrengthTitle: "Forza:",
        countLabel: "carte visibili",
        visibleCopiesSuffix: "copie in totale",
        noResultsTitle: "Nessuna carta trovata",
        noResultsText: "Prova a modificare i filtri o i termini di ricerca.",
        btnReset: "Ripristina filtri",
        all: "Tutti",
        strengthSpecial: "Speciali",
        emptyText: "(Nessun testo di effetto speciale)",
        modalTabTemplate: "Modello Generato",
        modalTabPhoto: "Carta Digitale / Foto Originale",
        modalGame: "Versione",
        modalFaction: "Fazione",
        modalType: "Tipo / Icona",
        modalLevel: "Set",
        modalStrength: "Forza",
        modalSource: "Immagine Sorgente",
        starterDeckLabel: "Mazzo Iniziale (8 Varianti da Torneo)",
        starterCopiesText: (perPlayer, total) => `${perPlayer}x per giocatore (${total} in totale)`,
        starterDescText: "Questa carta ha 8 versioni fisiche, una per ciascun simbolo giocatore del torneo:",
        modalFlipBtnText: "Gira carta (3D)",
        modalNavPrev: "Precedente",
        modalNavNext: "Successivo",
        modalClose: "Chiudi",
        factionHeaderSummary: (count, copies) => `${count} carte • ${copies} copie nel mazzo`,
        games: {
            all: "Tutte",
            c1: "Challengers! 1",
            c2: "Beach Cup"
        },
        levelLabels: {
            all: "Tutti i Set",
            A: "Livello A",
            B: "Livello B",
            C: "Livello C",
            S: "Mazzo Iniziale",
            "Entraîneur": "Allenatori",
            SOLO: "Modalità Solo",
            R: "Robot"
        },
        colors: {
            all: "Tutte le Fazioni",
            city: "Città",
            beach_club: "Beach Club",
            fairytale_forest: "Bosco Incantato",
            mountain_top: "Cima della Montagna",
            rainbow: "Arcobaleno",
            secret_base: "Base Segreta",
            toy_store: "Negozio di Giocattoli",
            university: "Università",
            castle: "Castello",
            film_studio: "Studio Cinematografico",
            funfair: "Luna Park",
            haunted_house: "Casa Stregata",
            outer_space: "Spazio Profondo",
            shipwreck: "Relitto",
            trainers: "Allenatori",
            robot: "Robot",
            cyan: "Città",
            vert: "Beach Club",
            violet: "Bosco Incantato",
            rose: "Cima della Montagna",
            multicolor: "Arcobaleno",
            marron: "Base Segreta",
            jaune: "Negozio di Giocattoli",
            universite: "Università",
            chateau: "Castello",
            cinema: "Studio Cinematografico",
            foire: "Luna Park",
            hantee: "Casa Stregata",
            espace: "Spazio Profondo",
            epave: "Relitto",
            noir: "Allenatori",
            gris: "Robot"
        },
        factionTabNames: {
            starter: "Mazzi Iniziali",
            robot: "Mazzo Robot",
            city: "Set Base (Città)",
            beach_club: "Beach Club",
            fairytale_forest: "Bosco Incantato",
            mountain_top: "Cima della Montagna",
            rainbow: "Arcobaleno",
            secret_base: "Base Segreta",
            toy_store: "Negozio di Giocattoli",
            university: "Università",
            castle: "Castello",
            film_studio: "Studio Cinematografico",
            funfair: "Luna Park",
            haunted_house: "Casa Stregata",
            outer_space: "Spazio Profondo",
            shipwreck: "Relitto",
            trainers: "Allenatori",
            all: "Tutte le Carte"
        },
        print: {
            modalTitle: "Stampa & Esportazione",
            modalSubtitleStandard: "Fogli P&P ufficiali con carte standard (63x88mm)",
            modalSubtitleStrips: "Strisce sottili di testo per bustine protettive sopra carte originali",
            tabSelection: "1. Selezione Carte",
            tabFormat: "2. Formato & Layout",
            quickFiltersTitle: "Selezione rapida:",
            btnAll: "Tutte le carte",
            btnFiltered: "Attualmente filtrate",
            btnC1: "Solo Challengers! 1",
            btnC2: "Solo Beach Cup",
            btnDeselect: "Deseleziona tutto",
            factionSelectTitle: "Seleziona fazioni:",
            btnFactionsAll: "Seleziona tutte",
            btnFactionsNone: "Deseleziona tutte",
            qtyDistTitle: "Distribuzione copie:",
            presetOfficial: "Ufficiale (secondo le copie della scatola)",
            presetSingle: "1 copia di ogni modello",
            metricUnique: "Modelli unici",
            metricPrintCopies: "Copie da stampare",
            metricSheets: "Fogli A4 necessari",
            specsLabelStandard: "Specifiche:",
            specsDescStandard: "Formato A4, griglia 3x3 (9 carte per foglio). Dimensione standard 63x88mm.",
            specsLabelStrips: "Specifiche:",
            specsDescStrips: "Formato A4, 4 colonne di strisce di testo (24 per foglio) per bustine protettive.",
            individualBreakdown: "Selezione individuale delle carte:",
            filterFactionLabel: "Filtra per fazione:",
            allFactionsOption: "Tutte le fazioni",
            langLabel: "Lingua di stampa:",
            layoutLabel: "Tipo di layout:",
            layoutTemplateTitle: "Modello di stampa (P&P)",
            layoutTemplateBadge: "Consigliato",
            layoutTemplateDesc: "Modello grafico con bordo, colori e icone.",
            layoutBgaTitle: "Foto Originali / Digitali",
            layoutBgaDesc: "Carte originali della versione digitale.",
            layoutStripsTitle: "Strisce di testo per bustine",
            layoutStripsDesc: "Strisce di testo sottili da inserire nelle bustine.",
            whiteMarginLabel: "Aggiungi bordo bianco attorno a ciascuna carta (facilita il taglio)",
            cutGuidesLabel: "Linee di taglio:",
            cutCrosses: "Crocette di taglio agli angoli",
            cutGrid: "Griglia di taglio completa",
            cutNone: "Nessuna linea di taglio",
            artAdjustLabel: "Regolazione immagini (foto originali):",
            artFitLabel: "Modalità:",
            artFitContain: "Adatta interamente (Contain)",
            artFitCover: "Riempi area (Cover)",
            artFitHeight: "Adatta all'altezza",
            artFitWidth: "Adatta alla larghezza",
            downloadLabel: "Genera & Esporta:",
            btnDownloadPDFStandard: "Scarica PDF A4 Standard",
            btnDownloadPDFStrips: "Scarica PDF Strisce",
            btnDownloadImages: "Scarica fogli come PNG (.zip)",
            btnPrintDirect: "Stampa diretta",
            previewTitle: "Anteprima di stampa:",
            stripSampleLabel: "Esempio di striscia:",
            pageOf: (cur, tot) => `Pagina ${cur} di ${tot}`,
            selectedPill: (sel, tot) => `${sel} su ${tot} selezionate`,
            typesSuffix: "modelli",
            cardsPhysicalSuffix: "carte",
            stripsTextSuffix: "strisce",
            sheetsSuffix: "fogli A4"
        },
        manage: {
            modalTitle: "Gestione del Mazzo",
            modalSubtitle: "Carica o cambia il mazzo di carte nel visualizzatore",
            activeBadge: "Mazzo attivo",
            loadedCards: (count, factions) => `${count} carte caricate in ${factions} fazioni`,
            sectionCatalog: "Catalogo Mazzi",
            sectionCatalogHint: "Scegli un mazzo preconfigurato o carica il tuo file .zip",
            btnLoad: "Carica",
            btnInUse: "✓ In uso",
            btnChangePack: "Carica mazzo (.zip)",
            btnChangePackSub: "Trascina qui un file .zip o fai clic per selezionarlo",
            btnChangePackBadge: "File locale",
            resourcesLabel: "Risorse per Creatori",
            downloadTemplate: "Modello pacchetto base (.zip)",
            btnGuide: "Guida alle specifiche",
            btnRemovePack: "Rimuovi mazzo personalizzato e torna a quello predefinito",
            confirmRemove: "Sei sicuro di voler rimuovere il mazzo personalizzato e tornare al gioco base?"
        },
        guide: {
            modalTitle: "Guida alle Specifiche del Mazzo",
            modalSubtitle: "Formato e struttura dei file per mazzi personalizzati di Challengers!",
            intro: "I mazzi personalizzati sono pacchetti .zip con la seguente struttura:",
            treeTitle: "Struttura cartelle prevista",
            tableTitle: "Campi in cards.json",
            thField: "Campo",
            thType: "Tipo",
            thDesc: "Descrizione",
            descId: "Numero identificativo univoco della carta",
            descLevel: "Livello: A, B, C, S (Iniziale) o R (Robot)",
            descStrength: "Forza base o \"?\"",
            descSetId: "ID fazione (es. castle, city)",
            descCopies: "Numero di copie fisiche nel mazzo",
            descArt: "Nome file dell'illustrazione in images/art_digital/",
            descLocales: "Oggetto con testi in es, en, fr, de, nl, it",
            ctaText: "Scarica il modello base vuoto per iniziare a creare il tuo mazzo:",
            downloadBtn: "Scarica modello pacchetto base (.zip)"
        },
        disclaimer: {
            modalTitle: "Note Legali & Riconoscimenti",
            modalSubtitle: "Informazioni su proprietà intellettuale e utilizzo",
            lead: "Challengers! è un gioco registrato ideato da Johannes Krenner e Markus Slawitscheck, pubblicato da 1 More Castle Games e Z-Man Games.",
            sec1Title: "Uso non commerciale",
            sec1Text: "Questo visualizzatore è uno strumento gratuito creato dai fan esclusivamente per uso privato e non commerciale.",
            sec2Title: "Diritti d'autore",
            sec2Text: "Tutti i diritti di immagini, marchi e loghi appartengono ai rispettivi proprietari.",
            sec3Title: "Privacy & Sicurezza",
            sec3Text: "Tutti i file dei mazzi vengono elaborati al 100% localmente nel tuo browser. Nessun dato viene trasmesso a server esterni.",
            btnUnderstood: "Ho capito"
        },
        onboarding: {
            title: "Carica mazzo (.zip)",
            desc: "Carica un mazzo di carte Challengers! in formato ZIP per visualizzare, filtrare e stampare le carte.",
            dropText: "Trascina qui il file ZIP",
            dropSubtext: "o fai clic per selezionare un file dal tuo dispositivo",
            btnSelect: "Seleziona file ZIP",
            demoHint: "Oppure inizia con un mazzo preconfigurato:",
            btnDemoBase: "Challengers! 1 (Gioco Base)",
            btnDemoBeach: "Challengers! 2 (Beach Cup)",
            btnDemoC1: "Challengers! 1 + 2 (Completo)",
            btnDemoPokemon: "Edizione Pokémon (Re-Theme)",
            templatesTitle: "Risorse & Modelli",
            templatesDesc: "File pronti all'uso e basi per creare carte personalizzate:",
            btnBaseZip: "Gioco Base (.zip)",
            btnBeachZip: "Beach Cup (.zip)",
            btnPokemonZip: "Mazzo Pokémon (.zip)",
            btnTemplateZip: "Modello Base (.zip)",
            btnGuide: "Guida alle specifiche",
            structureTitle: "Struttura prevista",
            privacy: "Elaborazione sicura: il file viene decompresso ed elaborato al 100% in locale nel tuo browser. Nessun dato lascia il tuo computer."
        }
    }
};

// Official 8 Tournament Player Icons Mapping (Clean Canonical & Legacy Mappings)
// =============================================================================
// SECCIÓN 3: CONFIGURACIÓN CANÓNICA DE JUGADORES, ICONOS Y FACCIONES BASE
// =============================================================================
/**
 * Mapeo de identificadores y nombres canónicos de los 8 jugadores de torneo
 * a sus respectivos archivos de imagen en images/icons/.
 * Incluye alias geométricos canónicos y compatibilidad con versiones previas.
 * @type {Object.<string, string>}
 */
const PLAYER_ICON_FILE_MAP = {
    '1': 'player_icon_1.png',
    '2': 'player_icon_2.png',
    '3': 'player_icon_3.png',
    '4': 'player_icon_4.png',
    '5': 'player_icon_5.png',
    '6': 'player_icon_6.png',
    '7': 'player_icon_7.png',
    '8': 'player_icon_8.png',
    // Canonical geometric shape names matching physical card iconography
    tricircle: 'player_icon_1.png',
    '3circles': 'player_icon_1.png',
    triangle: 'player_icon_2.png',
    pentagon: 'player_icon_3.png',
    doublediamond: 'player_icon_4.png',
    diamond: 'player_icon_5.png',
    square: 'player_icon_6.png',
    circle: 'player_icon_7.png',
    bowtie: 'player_icon_8.png',
    hourglass: 'player_icon_8.png',
    // Legacy aliases for backward compatibility
    clover: 'player_icon_1.png',
    star: 'player_icon_7.png',
    hexagon: 'player_icon_5.png',
    cross: 'player_icon_6.png'
};

/**
 * Configuración canónica predeterminada de los 8 jugadores de torneo oficial de Challengers!.
 * Define el código geométrico, símbolo Unicode, nombres multilingües, paleta cromática y fondos.
 * @type {Object.<number, {code: string, symbol: string, name: Object.<string, string>, color: string, bg: string}>}
 */
const DEFAULT_CANONICAL_PLAYERS = {
    1: { code: 'tricircle', symbol: '☵', name: { es: '3 Círculos', en: 'Tri-Circle', fr: '3 Cercles', de: '3 Kreise', nl: '3 Cirkels', it: '3 Cerchi' }, color: '#059669', bg: 'rgba(5, 150, 105, 0.12)' },
    2: { code: 'triangle', symbol: '▲', name: { es: 'Triángulo', en: 'Triangle', fr: 'Triangle', de: 'Dreieck', nl: 'Driehoek', it: 'Triangolo' }, color: '#0284c7', bg: 'rgba(2, 132, 199, 0.12)' },
    3: { code: 'pentagon', symbol: '⬟', name: { es: 'Pentágono', en: 'Pentagon', fr: 'Pentagone', de: 'Fünfeck', nl: 'Vijfhoek', it: 'Pentagono' }, color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
    4: { code: 'doublediamond', symbol: '⯐', name: { es: 'Doble Rombo', en: 'Double Diamond', fr: 'Double Losange', de: 'Doppelraute', nl: 'Dubbele Ruit', it: 'Doppio Rombo' }, color: '#e11d48', bg: 'rgba(225, 29, 72, 0.12)' },
    5: { code: 'diamond', symbol: '◆', name: { es: 'Rombo', en: 'Diamond', fr: 'Losange', de: 'Raute', nl: 'Ruit', it: 'Rombo' }, color: '#9333ea', bg: 'rgba(147, 51, 234, 0.12)' },
    6: { code: 'square', symbol: '■', name: { es: 'Cuadrado', en: 'Square', fr: 'Carré', de: 'Quadrat', nl: 'Vierkant', it: 'Quadrato' }, color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.12)' },
    7: { code: 'circle', symbol: '●', name: { es: 'Círculo', en: 'Circle', fr: 'Cercle', de: 'Kreis', nl: 'Cirkel', it: 'Cerchio' }, color: '#0d9488', bg: 'rgba(13, 148, 136, 0.12)' },
    8: { code: 'bowtie', symbol: '⧓', name: { es: 'Pajarita', en: 'Bowtie', fr: 'Nœud Papillon', de: 'Fliege', nl: 'Vlinderdas', it: 'Papillon' }, color: '#475569', bg: 'rgba(71, 85, 105, 0.12)' }
};

// Dynamically resolves player configuration from the active deck's JSON (or defaults)
/**
 * Resuelve dinámicamente la configuración y estilo visual de un jugador de torneo.
 * Consulta prioritariamente los metadatos 'player_icons' definidos en el JSON del mazo activo;
 * si no están presentes, recurre a la especificación canónica predeterminada.
 * 
 * @param {number|string} playerId - Número o identificador del jugador (1 al 8).
 * @returns {{id: number, code: string, symbol: string, name: Object.<string, string>, color: string, bg: string, icon_file: string}}
 */
function getPlayerConfig(playerId) {
    const p = Number(playerId);
    if (Array.isArray(playerIconsData) && playerIconsData.length > 0) {
        const found = playerIconsData.find(item => Number(item.id) === p);
        if (found) {
            const color = found.color || DEFAULT_CANONICAL_PLAYERS[p]?.color || '#0284c7';
            return {
                id: found.id,
                code: found.code || DEFAULT_CANONICAL_PLAYERS[p]?.code || `player_${p}`,
                symbol: found.symbol || DEFAULT_CANONICAL_PLAYERS[p]?.symbol || '●',
                name: found.name || DEFAULT_CANONICAL_PLAYERS[p]?.name || { es: `Jugador ${p}`, en: `Player ${p}`, fr: `Joueur ${p}` },
                color: color,
                bg: found.bg || `${color}1f`,
                icon_file: found.icon_file || `player_icon_${p}.png`
            };
        }
    }
    return DEFAULT_CANONICAL_PLAYERS[p] || {
        code: `player_${p}`,
        symbol: '●',
        name: { es: `Jugador ${p}`, en: `Player ${p}`, fr: `Joueur ${p}`, de: `Spieler ${p}`, nl: `Speler ${p}`, it: `Giocatore ${p}` },
        color: '#0284c7',
        bg: 'rgba(2, 132, 199, 0.12)'
    };
}

// Proxied PLAYER_CONFIG for backward compatibility with any direct index lookups
const PLAYER_CONFIG = new Proxy({}, {
    get: (target, prop) => {
        const num = Number(prop);
        if (!isNaN(num) && num > 0) {
            return getPlayerConfig(num);
        }
        return DEFAULT_CANONICAL_PLAYERS[prop] || undefined;
    }
});

/**
 * Obtiene la ruta absoluta o URL Blob en memoria del icono representativo de un jugador.
 * Intenta resolver el archivo dentro del paquete ZIP cargado; si no está en memoria,
 * devuelve la ruta relativa estándar del directorio de iconos.
 * 
 * @param {string|number} key - Clave o identificador del jugador o forma geométrica.
 * @returns {string} Ruta URL (o Blob URL) al archivo de imagen.
 */
function getPlayerIconPath(key) {
    if (!key) return '';
    const k = String(key).toLowerCase();
    const fileName = PLAYER_ICON_FILE_MAP[k] || `player_icon_${k}.png`;
    const resolved = resolveZipImage(fileName) || resolveZipImage(`images/icons/${fileName}`) || resolveZipImage(`icons/${fileName}`);
    if (resolved) return resolved;
    return `images/icons/${fileName}`;
}

// Pure data check: ZERO card IDs hardcoded in JavaScript logic!
/**
 * Determina si una carta corresponde a la variante especial de perro gigante ('Macro Dog') de torneo.
 * Evaluación puramente semántica basada en los metadatos de la carta, sin IDs fijos en código.
 * 
 * @param {Card|null} card - Objeto de carta a verificar.
 * @returns {boolean} True si es una carta de torneo Macro Dog.
 */
function isMacroDogCard(card) {
    if (!card) return false;
    return Boolean(card.is_macro_dog || card.macro_tournament);
}

/**
 * Evalúa si una carta pertenece al mazo automatizado del Robot (modo solitario o relleno).
 * 
 * @param {Card|null} card - Objeto de carta a inspeccionar.
 * @returns {boolean} True si la carta es del mazo Robot.
 */
function isRobotCard(card) {
    if (!card) return false;
    return card.set_id === 'robot' || card.level === 'R' || card.level === 'SOLO';
}

let selectedStarterPlayer = 'all';

/**
 * Genera el elemento HTML <img> para el icono de jugador especificado.
 * 
 * @param {string|number} key - Identificador o clave del jugador.
 * @param {string} [altText=''] - Texto descriptivo alternativo para accesibilidad.
 * @returns {string} Fragmento HTML del tag <img> con clases de estilo.
 */
function getPlayerIconHTML(key, altText = '') {
    const src = getPlayerIconPath(key);
    if (!src) return '';
    const cfg = typeof key === 'number' || !isNaN(Number(key)) ? getPlayerConfig(key) : null;
    const alt = altText || (cfg && (cfg.name[currentLang] || cfg.name.es)) || `Icono Jugador ${key}`;
    return `<img src="${src}" class="player-icon-img" alt="${alt}">`;
}

const PLAYER_ICONS_SVG = new Proxy({}, {
    get: (target, prop) => {
        if (typeof prop !== 'string') return '';
        return getPlayerIconHTML(prop);
    }
});

let currentPackCollection = null;

// Dynamically resolves the collection / edition name of any card or pack
/**
 * Resuelve de forma dinámica el nombre de la colección o edición temática de una carta o mazo.
 * 
 * @param {Card|null} card - Carta a inspeccionar.
 * @returns {string} Nombre legible de la colección (ej: 'Beach Cup', 'Challengers! 1', etc.).
 */
function getCardCollectionName(card) {
    if (card && card.collection) return card.collection;
    if (card && card.game === 'pokemon') return 'Edición Pokémon';
    if (currentPackCollection) return currentPackCollection;
    const isBeach = card && (card.game === 'c2' || (card.game && card.game.includes('Beach Cup')));
    return isBeach ? 'Beach Cup' : 'Challengers! 1';
}

// Game categories (default Challengers)
const gameCategories = ['all', 'c1', 'c2'];

// Base registry of known factions (icons, colors, badges, translations)
/**
 * Registro base de facciones oficiales canónicas con iconos, colores y etiquetas de set.
 * Sirve de respaldo cuando un mazo no define estilos explícitos en su bloque 'sets'.
 * @type {Array<Object>}
 */
const BASE_FACTIONS = [
    {
        id: 'starter',
        nameKey: 'starter',
        defaultName: 'Mazos de Inicio',
        iconType: 'svg',
        svgIcon: `<svg viewBox="0 0 24 24" class="faction-tab-icon-svg" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM12 7l1.5 3.5 3.5.5-2.5 2.5.5 3.5-3-1.8-3 1.8.5-3.5-2.5-2.5 3.5-.5z"/></svg>`,
        color: '#2563eb',
        badge: 'Mazo Inicial (Nivel S)'
    },
    {
        id: 'robot',
        nameKey: 'robot',
        defaultName: 'Mazo de Robot',
        iconType: 'svg',
        svgIcon: `<svg viewBox="0 0 24 24" class="faction-tab-icon-svg" fill="currentColor"><rect x="5" y="4" width="14" height="14" rx="2"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
        color: '#64748b',
        badge: 'Automático / Modo Solo'
    },
    {
        id: 'city',
        nameKey: 'city',
        defaultName: 'Conjunto Básico (Ciudad)',
        iconType: 'img',
        icon: 'images/icons/icon_ville.png',
        color: '#0284c7',
        badge: 'Conjunto Básico (Niveles A, B, C)'
    },
    {
        id: 'beach_club',
        nameKey: 'beach_club',
        defaultName: 'Club de Playa',
        iconType: 'img',
        icon: 'images/icons/icon_plage.png',
        color: '#0d9488',
        badge: 'Challengers! 1'
    },
    {
        id: 'fairytale_forest',
        nameKey: 'fairytale_forest',
        defaultName: 'Bosque Mágico',
        iconType: 'img',
        icon: 'images/icons/icon_contes.png',
        color: '#15803d',
        badge: 'Challengers! 1'
    },
    {
        id: 'mountain_top',
        nameKey: 'mountain_top',
        defaultName: 'Montaña',
        iconType: 'img',
        icon: 'images/icons/icon_montagne.png',
        color: '#585297',
        badge: 'Challengers! 1'
    },
    {
        id: 'rainbow',
        nameKey: 'rainbow',
        defaultName: 'Arcoíris',
        iconType: 'img',
        icon: 'images/icons/icon_arcenciel.png',
        color: 'linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6)',
        badge: 'Challengers! 1'
    },
    {
        id: 'secret_base',
        nameKey: 'secret_base',
        defaultName: 'Base Secreta',
        iconType: 'img',
        icon: 'images/icons/icon_infiltration.png',
        color: '#db2777',
        badge: 'Challengers! 1'
    },
    {
        id: 'toy_store',
        nameKey: 'toy_store',
        defaultName: 'Juguetería',
        iconType: 'img',
        icon: 'images/icons/icon_jouets.png',
        color: '#84cc16',
        badge: 'Challengers! 1'
    },
    {
        id: 'university',
        nameKey: 'university',
        defaultName: 'Universidad',
        iconType: 'img',
        icon: 'images/icons/icon_universite.png',
        color: '#78350f',
        badge: 'Challengers! 1'
    },
    {
        id: 'castle',
        nameKey: 'castle',
        defaultName: 'Castillo',
        iconType: 'img',
        icon: 'images/icons/icon_chateau.png',
        color: '#3c87be',
        badge: 'Beach Cup'
    },
    {
        id: 'film_studio',
        nameKey: 'film_studio',
        defaultName: 'Estudio de Cine',
        iconType: 'img',
        icon: 'images/icons/icon_cinema.png',
        color: '#70a146',
        badge: 'Beach Cup'
    },
    {
        id: 'funfair',
        nameKey: 'funfair',
        defaultName: 'Feria',
        iconType: 'img',
        icon: 'images/icons/icon_foire.png',
        color: '#f7b322',
        badge: 'Beach Cup'
    },
    {
        id: 'haunted_house',
        nameKey: 'haunted_house',
        defaultName: 'Casa Embrujada',
        iconType: 'img',
        icon: 'images/icons/icon_hantee.png',
        color: '#ee842e',
        badge: 'Beach Cup'
    },
    {
        id: 'outer_space',
        nameKey: 'outer_space',
        defaultName: 'Espacio Exterior',
        iconType: 'img',
        icon: 'images/icons/icon_espace.png',
        color: '#dd3e3b',
        badge: 'Beach Cup'
    },
    {
        id: 'shipwreck',
        nameKey: 'shipwreck',
        defaultName: 'Naufragio',
        iconType: 'img',
        icon: 'images/icons/icon_epave.png',
        color: '#8a318b',
        badge: 'Beach Cup'
    },
    {
        id: 'trainers',
        nameKey: 'trainers',
        defaultName: 'Entrenadores',
        iconType: 'svg',
        svgIcon: `<svg viewBox="0 0 24 24" class="faction-tab-icon-svg" fill="currentColor"><circle cx="12" cy="7" r="4.2"/><path d="M12 13c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg>`,
        color: '#1e293b',
        badge: 'Cartas Especiales'
    }
];

// Dynamically generate the active faction bookmark tabs according to loaded deck content
/**
 * Construye dinámicamente la lista de pestañas/marcadores de facción disponibles
 * basándose exclusivamente en el contenido real del mazo cargado en memoria.
 * Incluye pestañas especiales ('Todas', 'Mazos de Inicio', 'Robot') solo si aplican.
 * 
 * @returns {Array<{id: string, nameKey: string, defaultName: string, iconType: string, icon?: string, svgIcon?: string, color: string, badge: string, filterFn: Function}>}
 */
function getActiveFactionTabs() {
    if (!cardsData || cardsData.length === 0) {
        return [];
    }

    const t = i18n[currentLang] || i18n.es;
    const tabNames = t.factionTabNames || {};
    const tabs = [];

    // 1. "Todos" (Siempre presente: ver todo el mazo completo)
    tabs.push({
        id: 'all',
        nameKey: 'all',
        defaultName: tabNames['all'] || 'Todas las Cartas',
        iconType: 'svg',
        svgIcon: `<svg viewBox="0 0 24 24" class="faction-tab-icon-svg" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v14z"/></svg>`,
        color: '#3b82f6',
        badge: currentLang === 'fr' ? 'Collection complète' : (currentLang === 'en' ? 'Complete collection' : 'Colección Completa'),
        filterFn: () => true
    });

    // 2. Starter cards tab:
    // Show dedicated "Mazos de Inicio" tab if the deck has dedicated starter cards
    // (e.g. city starters in base Challengers/Pokemon, or starter cards with set_id === 'starter' or >= 6 starter cards)
    const starterCards = cardsData.filter(c => (c.level === 'S' || c.is_starter_card) && c.set_id !== 'robot');
    const isDedicatedStarter = starterCards.length >= 6 || cardsData.some(c => c.set_id === 'starter') || cardsData.some(c => c.set_id === 'city' && c.level === 'S');
    if (starterCards.length > 0 && isDedicatedStarter) {
        const starterDef = BASE_FACTIONS.find(d => d.id === 'starter');
        tabs.push({
            id: 'starter',
            nameKey: 'starter',
            defaultName: tabNames['starter'] || 'Mazos de Inicio',
            iconType: 'svg',
            svgIcon: starterDef?.svgIcon || `<svg viewBox="0 0 24 24" class="faction-tab-icon-svg" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM12 7l1.5 3.5 3.5.5-2.5 2.5.5 3.5-3-1.8-3 1.8.5-3.5-2.5-2.5 3.5-.5z"/></svg>`,
            color: '#2563eb',
            badge: 'Mazo Inicial (Nivel S)',
            filterFn: (c) => (c.level === 'S' || c.is_starter_card) && c.set_id !== 'robot'
        });
    }

    // 3. Robot tab: Only if the deck actually contains robot cards
    const robotCards = cardsData.filter(c => c.set_id === 'robot' || c.level === 'R' || c.level === 'SOLO');
    if (robotCards.length > 0) {
        const robotSet = setsData['robot'] || {};
        const robotDef = BASE_FACTIONS.find(d => d.id === 'robot');
        tabs.push({
            id: 'robot',
            nameKey: 'robot',
            defaultName: robotSet.name?.[currentLang] || robotSet.name?.es || tabNames['robot'] || 'Mazo de Robot',
            iconType: robotSet.icon_path ? 'img' : (robotDef?.svgIcon ? 'svg' : 'none'),
            icon: robotSet.icon_path || robotDef?.icon || '',
            svgIcon: robotDef?.svgIcon,
            color: robotSet.color_hex || robotDef?.color || '#64748b',
            badge: 'Automático / Modo Solo',
            filterFn: (c) => c.set_id === 'robot' || c.level === 'R' || c.level === 'SOLO'
        });
    }

    // 4. Sets/factions that exist in cardsData
    const setIdsInDeck = [...new Set(cardsData.map(c => c.set_id).filter(Boolean))];

    const canonicalOrder = [
        'city', 'beach_club', 'fairytale_forest', 'mountain_top', 'rainbow',
        'secret_base', 'toy_store', 'university', 'castle', 'film_studio',
        'funfair', 'haunted_house', 'outer_space', 'shipwreck', 'trainers'
    ];

    const sortedSetIds = [
        ...canonicalOrder.filter(id => setIdsInDeck.includes(id)),
        ...setIdsInDeck.filter(id => !canonicalOrder.includes(id) && id !== 'robot' && id !== 'starter')
    ];

    sortedSetIds.forEach(setId => {
        // If dedicated starter tab exists and setId is 'city', city tab filters non-starter cards
        const filterFn = (isDedicatedStarter && setId === 'city')
            ? (c => c.set_id === 'city' && c.level !== 'S')
            : (c => c.set_id === setId || (setsData[c.set_id] && setsData[c.set_id].color_key === setId));

        const setCards = cardsData.filter(filterFn);
        if (setCards.length === 0) return;

        const setInfo = setsData[setId] || {};
        const baseDef = BASE_FACTIONS.find(d => d.id === setId);

        const name = setInfo.name?.[currentLang]
            || setInfo.name?.es
            || (baseDef && tabNames[baseDef.nameKey])
            || baseDef?.defaultName
            || setId;

        const color = setInfo.color_hex || baseDef?.color || '#0284c7';
        const iconPath = setInfo.icon_path || baseDef?.icon || '';

        tabs.push({
            id: setId,
            nameKey: baseDef?.nameKey || setId,
            defaultName: name,
            iconType: iconPath ? 'img' : (baseDef?.svgIcon ? 'svg' : 'none'),
            icon: iconPath,
            svgIcon: baseDef?.svgIcon,
            color: color,
            badge: baseDef?.badge || getCardCollectionName(setCards[0]) || '',
            filterFn: filterFn
        });
    });

    return tabs;
}

// Transparent Proxy for full backward compatibility with any FACTION_TABS calls
const FACTION_TABS = new Proxy([], {
    get(target, prop) {
        const tabs = getActiveFactionTabs();
        if (prop === Symbol.iterator) {
            return tabs[Symbol.iterator].bind(tabs);
        }
        if (prop === 'length') return tabs.length;
        if (typeof tabs[prop] === 'function') {
            return tabs[prop].bind(tabs);
        }
        return tabs[prop];
    }
});

// =============================================================================
// SECCIÓN 4: RESOLUCIÓN DE IMÁGENES Y RECURSOS EN MEMORIA (BLOBS Y ARCHIVOS)
// =============================================================================
/** Mapa dinámico de URLs Blob en memoria para recursos extraídos del ZIP */
let zipImageBlobUrls = new Map();

/**
 * Localizador maestro de recursos gráficos en memoria.
 * Resuelve nombres de archivo e ilustraciones contra el mapa de Blob URLs extraídas del ZIP activo,
 * tolerando variaciones en mayúsculas/minúsculas, separadores de ruta (/ o \) o rutas relativas.
 * 
 * @param {string} imgName - Nombre o ruta relativa del archivo de imagen.
 * @returns {string} Blob URL válida en memoria, o cadena vacía si no existe.
 */
function resolveZipImage(imgName) {
    if (!imgName) return '';
    if (imgName.startsWith('blob:') || imgName.startsWith('data:')) return imgName;

    const clean = imgName.replace(/\\/g, '/').trim();
    const lower = clean.toLowerCase();
    const basename = clean.split('/').pop().toLowerCase();

    if (zipImageBlobUrls.has(clean)) return zipImageBlobUrls.get(clean);
    if (zipImageBlobUrls.has(lower)) return zipImageBlobUrls.get(lower);
    if (zipImageBlobUrls.has(basename)) return zipImageBlobUrls.get(basename);

    return '';
}

// Helper to normalize art framing mode to guaranteed values without distortion
/**
 * Normaliza el modo de encuadre de la ilustración a un valor estándar seguro sin distorsión.
 * 
 * @param {string} [fit='contain'] - Modo solicitado ('cover', 'contain', 'fit-height', 'fit-width').
 * @returns {'cover'|'contain'|'fit-height'|'fit-width'} Modo normalizado.
 */
function normalizeArtFit(fit) {
    if (!fit) return 'contain';
    if (fit === 'fit-height' || fit === 'height') return 'fit-height';
    if (fit === 'fit-width' || fit === 'width') return 'fit-width';
    if (fit === 'cover') return 'cover';
    return 'contain';
}

/**
 * Obtiene la clase CSS correspondiente para el encuadre de la ilustración de la carta.
 * 
 * @param {string} fit - Modo de encuadre.
 * @returns {string} Clase CSS (ej: 'fit-cover', 'fit-contain').
 */
function normalizeArtFitClass(fit) {
    const norm = normalizeArtFit(fit);
    return `fit-${norm}`;
}

// Helpers to resolve relative image paths from clean filenames
/**
 * Resuelve la ruta o Blob URL de una imagen digital completa de carta (modo photo).
 * 
 * @param {string} imgName - Nombre del archivo de imagen.
 * @returns {string} Ruta absoluta, relativa o Blob URL resuelta.
 */
function getCardImagePath(imgName) {
    if (!imgName) return '';
    const resolved = resolveZipImage(imgName);
    if (resolved) return resolved;
    const pathAttempt = resolveZipImage(`images/cards_digital/${imgName}`);
    if (pathAttempt) return pathAttempt;
    if (imgName.startsWith('http') || imgName.includes('/')) return imgName;
    return `images/cards_digital/${imgName}`;
}

/**
 * Resuelve la ruta o Blob URL de la ilustración principal de la carta (images/art_digital/).
 * 
 * @param {string} imgName - Nombre del archivo de arte.
 * @returns {string} Blob URL resuelta o ruta de respaldo.
 */
function getArtImagePath(imgName) {
    if (!imgName) return '';
    const resolved = resolveZipImage(imgName);
    if (resolved) return resolved;
    const pathAttempt = resolveZipImage(`images/art_digital/${imgName}`);
    if (pathAttempt) return pathAttempt;
    if (imgName.startsWith('http') || imgName.includes('/')) return imgName;
    return `images/art_digital/${imgName}`;
}

/**
 * Resuelve la ruta o Blob URL del icono representativo de una facción.
 * 
 * @param {string} iconFile - Nombre del archivo del icono.
 * @returns {string} Blob URL o ruta relativa en images/icons/.
 */
function getFactionIconPath(iconFile) {
    if (!iconFile) return '';
    if (iconFile.startsWith('data:') || iconFile.startsWith('blob:')) return iconFile;
    const resolved = resolveZipImage(iconFile);
    if (resolved) return resolved;
    const pathAttempt = resolveZipImage(`images/icons/${iconFile}`);
    if (pathAttempt) return pathAttempt;
    const pathAttempt2 = resolveZipImage(`icons/${iconFile}`);
    if (pathAttempt2) return pathAttempt2;
    if (iconFile.startsWith('http://') || iconFile.startsWith('https://')) return iconFile;
    if (iconFile.includes('/')) return iconFile;
    return `images/icons/${iconFile}`;
}

const playerIconSymbols = {
    clover: '☘',
    triangle: '▲',
    circle: '●',
    square: '■',
    star: '★',
    diamond: '◆',
    hexagon: '⬢',
    cross: '✚'
};

// =============================================================================
// SECCIÓN 5: CONTROLADORES DE INTERFAZ, EVENTOS DEL DOM Y ATAJOS DE TECLADO
// =============================================================================
/**
 * Recalcula y sincroniza el desfase superior dinámico (CSS Custom Property --header-offset)
 * de la cabecera fija y barra de búsqueda al cambiar dimensiones o redimensionar la ventana.
 */
function updateStickyHeaderOffset() {
    const header = document.querySelector('.app-header');
    if (header) {
        const h = header.offsetHeight;
        document.documentElement.style.setProperty('--app-header-height', `${h}px`);
    }
}
window.addEventListener('resize', updateStickyHeaderOffset);
window.addEventListener('orientationchange', updateStickyHeaderOffset);

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    updateStickyHeaderOffset();
    setupEventListeners();
    setupZipUploadHandlers();
    if (window.location.hash === '#upload') {
        cardsData = [];
        showZipUploadScreen();
        return;
    }
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#upload') {
            cardsData = [];
            showZipUploadScreen();
        }
    });

    // Check if a cards ZIP package was previously saved in IndexedDB
    const savedPack = await getZipFromIndexedDB();
    if (savedPack && savedPack.blob) {
        showZipProgress(true, `Cargando paquete guardado (${savedPack.name})...`, 15);
        await loadZipPackage(savedPack.blob, savedPack.name, false);
    } else {
        // Initial state: no cards in memory, show ZIP upload onboarding
        showZipUploadScreen();
    }
});

// Setup DOM Event Listeners
/**
 * Inicializa y vincula todos los controladores de eventos del DOM de la aplicación:
 * - Buscador en tiempo real con debounce.
 * - Conmutadores de idioma y modo de visualización.
 * - Atajos de teclado para modales e inspección.
 * - Menú lateral responsive y botones de navegación.
 */
function setupEventListeners() {
    // Brand Link / Logo Click -> Scroll to top
    const brandLink = document.getElementById('brandLink');
    if (brandLink) {
        brandLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Language Switch (Dropdown + flag)
    const langSelect = document.getElementById('langSelectDropdown');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => setLanguage(e.target.value));
    }
    const btnEs = document.getElementById('btnLangEs');
    if (btnEs) btnEs.addEventListener('click', () => setLanguage('es'));
    const btnFr = document.getElementById('btnLangFr');
    if (btnFr) btnFr.addEventListener('click', () => setLanguage('fr'));
    const btnEn = document.getElementById('btnLangEn');
    if (btnEn) btnEn.addEventListener('click', () => setLanguage('en'));
    const btnDe = document.getElementById('btnLangDe');
    if (btnDe) btnDe.addEventListener('click', () => setLanguage('de'));
    const btnNl = document.getElementById('btnLangNl');
    if (btnNl) btnNl.addEventListener('click', () => setLanguage('nl'));
    const btnIt = document.getElementById('btnLangIt');
    if (btnIt) btnIt.addEventListener('click', () => setLanguage('it'));

    // Sidebar Toggle & Close (Menu Lateral Off-Canvas Drawer)
    const sidebar = document.getElementById('filtersSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    function openSidebar() {
        if (!sidebar) return;
        sidebar.classList.add('is-open');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('is-active');
    }

    function closeSidebar() {
        if (!sidebar) return;
        sidebar.classList.remove('is-open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('is-active');
    }

    function toggleSidebar() {
        if (!sidebar) return;
        if (sidebar.classList.contains('is-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

    // Search input
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
        renderCards();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        renderCards();
        searchInput.focus();
    });

    // Flip All Cards button
    document.getElementById('flipAllBtn').addEventListener('click', toggleFlipAll);

    // Reset filters
    document.getElementById('resetFiltersBtn').addEventListener('click', resetAllFilters);
    document.getElementById('btnResetFromEmpty').addEventListener('click', resetAllFilters);

    // Modal close & nav
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalPrevBtn').addEventListener('click', showPrevModalCard);
    document.getElementById('modalNextBtn').addEventListener('click', showNextModalCard);

    // Close modal when clicking backdrop
    document.getElementById('cardModal').addEventListener('click', (e) => {
        if (e.target.id === 'cardModal') closeModal();
    });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
        const modal = document.getElementById('cardModal');
        const printModal = document.getElementById('printModal');
        if (e.key === 'Escape' && sidebar && sidebar.classList.contains('is-open')) {
            closeSidebar();
            return;
        }
        if (modal && modal.style.display === 'flex') {
            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowLeft') showPrevModalCard();
            if (e.key === 'ArrowRight') showNextModalCard();
        } else if (printModal && printModal.style.display === 'flex') {
            if (e.key === 'Escape') closePrintModal();
            if (e.key === 'ArrowLeft') showPrevPreviewPage();
            if (e.key === 'ArrowRight') showNextPreviewPage();
        } else {
            const discModal = document.getElementById('disclaimerModal');
            if (discModal && discModal.style.display === 'flex' && e.key === 'Escape') {
                discModal.style.display = 'none';
                discModal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
            const infoModal = document.getElementById('deckInfoModal');
            if (infoModal && infoModal.style.display === 'flex' && e.key === 'Escape') {
                closeDeckInfoModal();
            }
        }
    });

    // Print & PDF Generator Modal events
    const openPrintBtn = document.getElementById('openPrintModalBtn');
    if (openPrintBtn) openPrintBtn.addEventListener('click', openPrintModal);

    const closePrintBtn = document.getElementById('printModalCloseBtn');
    if (closePrintBtn) closePrintBtn.addEventListener('click', closePrintModal);

    const printModalBackdrop = document.getElementById('printModal');
    if (printModalBackdrop) {
        printModalBackdrop.addEventListener('click', (e) => {
            if (e.target.id === 'printModal') closePrintModal();
        });
    }

    // Quick select buttons (optional chaining for removed/legacy buttons)
    document.getElementById('btnSelectAllCards')?.addEventListener('click', selectAllCardsForPrint);
    document.getElementById('btnSelectFilteredCards')?.addEventListener('click', selectFilteredCardsForPrint);
    document.getElementById('btnSelectC1Cards')?.addEventListener('click', selectC1CardsForPrint);
    document.getElementById('btnSelectC2Cards')?.addEventListener('click', selectC2CardsForPrint);
    document.getElementById('btnDeselectAllCards')?.addEventListener('click', deselectAllCardsForPrint);

    const btnSelectAllFactions = document.getElementById('btnSelectAllFactions');
    if (btnSelectAllFactions) btnSelectAllFactions.addEventListener('click', selectAllCardsForPrint);
    const btnDeselectAllFactions = document.getElementById('btnDeselectAllFactions');
    if (btnDeselectAllFactions) btnDeselectAllFactions.addEventListener('click', deselectAllCardsForPrint);

    // Quantity presets
    document.getElementById('btnPresetOfficialDeck').addEventListener('click', applyPresetOfficialDeck);
    document.getElementById('btnPresetSingleCopy').addEventListener('click', applyPresetSingleCopy);
    document.getElementById('btnPresetAddOne').addEventListener('click', applyPresetAddOne);
    document.getElementById('btnPresetSubOne').addEventListener('click', applyPresetSubOne);
    document.getElementById('btnToggleCardList').addEventListener('click', toggleCardQuantityList);

    const printListFactionFilter = document.getElementById('printListFactionFilter');
    if (printListFactionFilter) {
        printListFactionFilter.addEventListener('change', () => {
            renderCardQuantityList();
        });
    }

    // Print modal tabs
    const btnPrintTabSelection = document.getElementById('printTabBtnSelection');
    if (btnPrintTabSelection) {
        btnPrintTabSelection.addEventListener('click', () => switchPrintTab('selection'));
    }
    const btnPrintTabFormat = document.getElementById('printTabBtnFormat');
    if (btnPrintTabFormat) {
        btnPrintTabFormat.addEventListener('click', () => switchPrintTab('format'));
    }

    // Preview page navigation
    document.getElementById('btnPrevPage').addEventListener('click', showPrevPreviewPage);
    document.getElementById('btnNextPage').addEventListener('click', showNextPreviewPage);

    // Generate / Print action buttons
    document.getElementById('btnDownloadPDF').addEventListener('click', downloadPrintPDF);
    const btnImages = document.getElementById('btnDownloadImages');
    if (btnImages) {
        btnImages.addEventListener('click', downloadCardsAsImagesZIP);
    }
    document.getElementById('btnPrintDirect').addEventListener('click', printDirectNative);

    // Hover preview delegation for breakdown list
    const printCardsList = document.getElementById('printCardsList');
    if (printCardsList) {
        printCardsList.addEventListener('mouseenter', (e) => {
            const wrap = e.target.closest('.card-qty-thumb-wrap');
            if (wrap) showThumbHoverPreview(wrap);
        }, true);

        printCardsList.addEventListener('mouseleave', (e) => {
            const wrap = e.target.closest('.card-qty-thumb-wrap');
            if (wrap) hideThumbHoverPreview();
        }, true);

        printCardsList.addEventListener('scroll', hideThumbHoverPreview, { passive: true });
    }

    // Live preview update on print settings change
    const selectPrintLang = document.getElementById('selectPrintLang');
    if (selectPrintLang) {
        selectPrintLang.addEventListener('change', () => renderPrintPreview(previewCurrentPage));
    }

    document.querySelectorAll('input[name="printMode"]').forEach(r => {
        r.addEventListener('change', () => {
            updatePrintBadge();
            renderPrintPreview(previewCurrentPage);
        });
    });
    document.querySelectorAll('input[name="printCutType"]').forEach(r => {
        r.addEventListener('change', () => {
            renderPrintPreview(previewCurrentPage);
        });
    });

    const chkWhiteMarginEl = document.getElementById('chkWhiteMargin');
    const numWhiteMarginEl = document.getElementById('numWhiteMargin');
    const marginValBox = document.getElementById('printMarginValBox');

    function handleMarginChange() {
        const isChecked = chkWhiteMarginEl ? chkWhiteMarginEl.checked : true;
        if (marginValBox) marginValBox.classList.toggle('is-disabled', !isChecked);
        if (numWhiteMarginEl) numWhiteMarginEl.disabled = !isChecked;
        updatePrintBadge();
        renderPrintPreview(previewCurrentPage);
    }

    if (chkWhiteMarginEl) {
        chkWhiteMarginEl.addEventListener('change', handleMarginChange);
    }
    if (numWhiteMarginEl) {
        numWhiteMarginEl.addEventListener('input', () => {
            updatePrintBadge();
            renderPrintPreview(previewCurrentPage);
        });
        numWhiteMarginEl.addEventListener('change', () => {
            updatePrintBadge();
            renderPrintPreview(previewCurrentPage);
        });
    }

    const chkSummaryPageEl = document.getElementById('chkPrintSummaryPage');
    if (chkSummaryPageEl) {
        chkSummaryPageEl.addEventListener('change', () => {
            updatePrintBadge();
        });
    }

    // Artwork fit & zoom controls
    const artFitSelect = document.getElementById('selectPrintArtFit');
    if (artFitSelect) {
        artFitSelect.addEventListener('change', () => {
            renderPrintPreview(previewCurrentPage);
        });
    }

    const artScaleInput = document.getElementById('rangePrintArtScale');
    const artScaleVal = document.getElementById('txtPrintArtScaleVal');
    if (artScaleInput) {
        artScaleInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (artScaleVal) artScaleVal.textContent = `${val}%`;
            document.querySelectorAll('.btn-micro-chip').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.scale === val);
            });
            renderPrintPreview(previewCurrentPage);
        });
    }

    document.querySelectorAll('.btn-micro-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const scale = btn.dataset.scale;
            if (artScaleInput) {
                artScaleInput.value = scale;
                if (artScaleVal) artScaleVal.textContent = `${scale}%`;
            }
            document.querySelectorAll('.btn-micro-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPrintPreview(previewCurrentPage);
        });
    });

    // Footer & Disclaimer Modal
    const footerBtnDisclaimer = document.getElementById('footerBtnDisclaimer');
    const disclaimerModal = document.getElementById('disclaimerModal');
    const disclaimerCloseBtn = document.getElementById('disclaimerCloseBtn');
    const disclaimerAcceptBtn = document.getElementById('disclaimerAcceptBtn');

    function openDisclaimerModal() {
        if (disclaimerModal) {
            disclaimerModal.style.display = 'flex';
            disclaimerModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeDisclaimerModal() {
        if (disclaimerModal) {
            disclaimerModal.style.display = 'none';
            disclaimerModal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    }

    if (footerBtnDisclaimer) footerBtnDisclaimer.addEventListener('click', openDisclaimerModal);
    if (disclaimerCloseBtn) disclaimerCloseBtn.addEventListener('click', closeDisclaimerModal);
    if (disclaimerAcceptBtn) disclaimerAcceptBtn.addEventListener('click', closeDisclaimerModal);
    if (disclaimerModal) {
        disclaimerModal.addEventListener('click', (e) => {
            if (e.target.id === 'disclaimerModal') closeDisclaimerModal();
        });
    }

    // Deck Info Modal listeners
    const deckInfoCloseBtn = document.getElementById('deckInfoCloseBtn');
    const deckInfoCloseFooterBtn = document.getElementById('deckInfoCloseFooterBtn');
    const deckInfoModal = document.getElementById('deckInfoModal');
    if (deckInfoCloseBtn) deckInfoCloseBtn.addEventListener('click', closeDeckInfoModal);
    if (deckInfoCloseFooterBtn) deckInfoCloseFooterBtn.addEventListener('click', closeDeckInfoModal);
    if (deckInfoModal) {
        deckInfoModal.addEventListener('click', (e) => {
            if (e.target.id === 'deckInfoModal') closeDeckInfoModal();
        });
    }

    const footerBtnScrollTop = document.getElementById('footerBtnScrollTop');
    if (footerBtnScrollTop) {
        footerBtnScrollTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const container = document.getElementById('factionCardsContainer');
            if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

// =============================================================================
// SECCIÓN 6: CAPA DE PERSISTENCIA LOCAL EN NAVEGADOR (IndexedDB)
// =============================================================================
// Permite guardar y recuperar el último mazo cargado sin transferir datos a servidores.

const DB_NAME = 'ChallengersCardDB';
const DB_VERSION = 1;
const STORE_NAME = 'packs';

let currentPackInfo = {
    name: '',
    count: 0
};

/**
 * Inicializa y abre la conexión con la base de datos IndexedDB local ('ChallengersCardDB').
 * Crea el almacén de objetos 'packs' en la primera ejecución o actualización de versión.
 * 
 * @returns {Promise<IDBDatabase>} Promesa que resuelve la instancia de base de datos activa.
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Persiste de forma asíncrona un archivo .zip de mazo completo en IndexedDB.
 * Permite que el usuario conserve su mazo cargado entre sesiones y recargas de página.
 * 
 * @param {Blob} fileBlob - Objeto binario del archivo .zip.
 * @param {string} fileName - Nombre del archivo del paquete.
 * @returns {Promise<boolean>} Promesa que resuelve true al completar la transacción.
 */
async function saveZipToIndexedDB(fileBlob, fileName) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const record = {
                id: 'active_pack',
                name: fileName || 'paquete_cartas.zip',
                blob: fileBlob,
                updatedAt: Date.now()
            };
            store.put(record);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('No se pudo guardar en IndexedDB:', err);
        return false;
    }
}

async function getZipFromIndexedDB() {
    try {
        const db = await openDatabase();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('active_pack');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.warn('Error leyendo IndexedDB:', err);
        return null;
    }
}

async function clearZipFromIndexedDB() {
    try {
        const db = await openDatabase();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete('active_pack');
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (err) {
        return false;
    }
}

// Control visibility of navbar items when deck is selected vs empty
/**
 * Sincroniza la visibilidad de los controles de la barra de navegación superior
 * según exista o no un mazo de cartas activo cargado en memoria.
 */
function updateNavbarVisibility() {
    const hasDeck = Array.isArray(cardsData) && cardsData.length > 0;

    if (hasDeck) {
        document.body.classList.remove('no-deck-selected');
    } else {
        document.body.classList.add('no-deck-selected');
        if (typeof closeSidebar === 'function') closeSidebar();
    }

    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn) toggleBtn.style.display = hasDeck ? 'inline-flex' : 'none';

    const deckLogo = document.getElementById('headerDeckLogo');
    if (deckLogo) deckLogo.style.display = hasDeck ? 'block' : 'none';

    const searchWrapper = document.querySelector('.header-search-wrapper');
    if (searchWrapper) searchWrapper.style.display = hasDeck ? 'flex' : 'none';

    const flipBtn = document.getElementById('flipAllBtn');
    if (flipBtn) flipBtn.style.display = hasDeck ? 'inline-flex' : 'none';

    const printBtn = document.getElementById('openPrintModalBtn');
    if (printBtn) printBtn.style.display = hasDeck ? 'inline-flex' : 'none';

    const zipBtn = document.getElementById('zipManagerBtn');
    if (zipBtn) zipBtn.style.display = hasDeck ? 'inline-flex' : 'none';

    if (!hasDeck) {
        const rail = document.getElementById('factionBookmarksBar');
        if (rail) rail.innerHTML = '';
        const factionsWrapper = document.getElementById('factionsWrapper');
        if (factionsWrapper) factionsWrapper.style.display = 'none';
    }
}

/**
 * Presenta en pantalla la interfaz de bienvenida y zona de carga de archivos ZIP,
 * ocultando la galería principal de cartas y restaurando el estado inicial.
 */
function showZipUploadScreen() {
    const uploadScreen = document.getElementById('zipUploadScreen');
    const factionsWrapper = document.getElementById('factionsWrapper');
    if (uploadScreen) uploadScreen.style.display = 'flex';
    if (factionsWrapper) factionsWrapper.style.display = 'none';

    const totalCountEl = document.getElementById('totalCount');
    if (totalCountEl) totalCountEl.textContent = '0';
    const visibleCountEl = document.getElementById('visibleCount');
    if (visibleCountEl) visibleCountEl.textContent = '0';
    const visibleCopiesEl = document.getElementById('visibleCopiesCount');
    if (visibleCopiesEl) visibleCopiesEl.textContent = '0 cartas';

    renderDeckCatalogUI();
    updateNavbarVisibility();
}

/**
 * Oculta la pantalla de carga e inicializa la vista de galería con el mazo importado.
 * 
 * @param {string} [packName='paquete_cartas.zip'] - Nombre representativo del mazo cargado.
 */
function hideZipUploadScreen(packName) {
    const uploadScreen = document.getElementById('zipUploadScreen');
    const factionsWrapper = document.getElementById('factionsWrapper');
    if (uploadScreen) uploadScreen.style.display = 'none';
    if (factionsWrapper) factionsWrapper.style.display = 'flex';

    currentPackInfo.name = packName || 'paquete_cartas.zip';
    currentPackInfo.count = cardsData.length;

    const currentNameEl = document.getElementById('zipCurrentPackName');
    if (currentNameEl) currentNameEl.textContent = currentPackInfo.name;
    const currentMetaEl = document.getElementById('zipCurrentPackMeta');
    if (currentMetaEl) {
        const t = i18n[currentLang] || i18n.es;
        currentMetaEl.textContent = t.manage?.loadedCards ? t.manage.loadedCards(cardsData.length) : `${cardsData.length} cartas cargadas`;
    }

    updateActiveDeckCatalogState();
    updateNavbarVisibility();
}

// =============================================================================
// SECCIÓN 7: CATÁLOGO CENTRALIZADO Y CARGA ASÍNCRONA DE EXPANSIONES COMUNITARIAS
// =============================================================================
const DECK_CATALOG = [
    {
        id: 'yokais',
        filename: 'yokais_pack.zip',
        pattern: 'yokais',
        title: { es: 'Expansión Yokais', en: 'Yokais Expansion', fr: 'Extension Yokais' },
        tag: { es: 'Expansión Temática', en: 'Thematic Expansion', fr: 'Extension Thématique' },
        badge: 'yokais',
        description: {
            es: 'Espíritus y criaturas de la mitología japonesa con arte tradicional.',
            en: 'Spirits and creatures of Japanese mythology with traditional art.',
            fr: 'Esprits et créatures de la mythologie japonaise avec art traditionnel.'
        },
        accentColor: '#8b5cf6',
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
        isOfficial: false,
        author: 'kr43xpo',
        quickDemoClass: 'zip-demo-yokais-btn'
    },
    {
        id: 'dioses',
        filename: 'dioses_pack.zip',
        pattern: 'dioses',
        title: { es: 'Expansión Dioses', en: 'Gods Expansion', fr: 'Extension Dieux' },
        tag: { es: 'Expansión Temática', en: 'Thematic Expansion', fr: 'Extension Thématique' },
        badge: 'dioses',
        description: {
            es: 'Mitologías del mundo: panteones nórdico, egipcio, griego, hindú y cristiano.',
            en: 'World mythologies: Norse, Egyptian, Greek, Hindu and Christian pantheons.',
            fr: 'Mythologies du monde : panthéons nordique, égyptien, grec, hindou et chrétien.'
        },
        accentColor: '#f59e0b',
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 22 7"/><line x1="4" y1="7" x2="4" y2="18"/><line x1="9" y1="7" x2="9" y2="18"/><line x1="15" y1="7" x2="15" y2="18"/><line x1="20" y1="7" x2="20" y2="18"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="1" y1="21" x2="23" y2="21"/></svg>`,
        isOfficial: false,
        author: 'kr43xpo',
        quickDemoClass: 'zip-demo-dioses-btn'
    },
    {
        id: 'expansion_12_sets',
        filename: 'expansion_12_sets_pack.zip',
        pattern: 'expansion_12_sets',
        title: {
            es: 'Expansión 12 Conjuntos',
            en: '12 Custom Sets Expansion',
            fr: 'Extension 12 Ensembles'
        },
        tag: {
            es: '12 Facciones BGG',
            en: '12 BGG Factions',
            fr: '12 Factions BGG'
        },
        badge: 'expansion_12_sets',
        description: {
            es: '12 facciones temáticas (129 cartas únicas, 480 copias equilibradas) de la comunidad BGG.',
            en: '12 thematic factions (129 unique cards, 480 balanced copies) from the BGG community.',
            fr: '12 factions thématiques (129 cartes uniques, 480 exemplaires équilibrés) de la communauté BGG.'
        },
        accentColor: '#6366f1',
        iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="14" height="15" rx="2"/><path d="M6 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2"/></svg>`,
        isOfficial: false,
        author: 'strezah',
        quickDemoClass: 'zip-demo-exp12-btn'
    }
];

// Unified generic deck loader - Zero duplicate fetch code!
/**
 * Descarga y carga en memoria de forma unificada una expansión temática del catálogo comunitario.
 * 
 * @param {string} deckIdOrFilename - Identificador del mazo en DECK_CATALOG o nombre del archivo .zip.
 * @returns {Promise<void>}
 */
async function loadCatalogDeck(deckIdOrFilename) {
    const deck = DECK_CATALOG.find(d => d.id === deckIdOrFilename || d.filename === deckIdOrFilename);
    if (!deck) {
        showToast(`Mazo no encontrado en el catálogo: ${deckIdOrFilename}`, 'error');
        return;
    }
    const manageModal = document.getElementById('zipManageModal');
    if (manageModal) manageModal.style.display = 'none';

    const deckTitle = deck.title[currentLang] || deck.title.es;
    const isFr = currentLang === 'fr';
    const isEn = currentLang === 'en';
    const statusMsg = isFr ? `Téléchargement de ${deckTitle}...` : (isEn ? `Downloading ${deckTitle}...` : `Descargando ${deckTitle}...`);

    showZipProgress(true, statusMsg, 15);
    try {
        const response = await fetch(`decks/${deck.filename}?v=${Date.now()}`);
        if (!response.ok) throw new Error(`No se pudo descargar ${deck.filename}`);
        const blob = await response.blob();
        await loadZipPackage(blob, deck.filename, true);
    } catch (err) {
        showZipProgress(false);
        showToast(`Error cargando ${deckTitle}: ${err.message}`, 'error');
    }
}

// Dynamically populates and renders all deck elements across the UI
/**
 * Renderiza de forma reactiva las tarjetas de la 'Biblioteca de Mazos' en todos los contenedores UI
 * (pantalla de bienvenida y modal de gestión de mazo), actualizando badges y botones de estado.
 */
function renderDeckCatalogUI() {
    const isFr = currentLang === 'fr';
    const isEn = currentLang === 'en';

    // 1. Modal / Page Deck Catalog Grids (both on welcome screen and in manage modal)
    const catalogGrids = document.querySelectorAll('.deck-catalog-list, .zip-deck-catalog');
    if (catalogGrids.length > 0) {
        const activePackName = (currentPackInfo.name || '').toLowerCase();
        const t = (typeof i18n !== 'undefined' && i18n[currentLang]) || (typeof i18n !== 'undefined' && i18n.es) || {};
        const btnInUse = t.manage?.btnInUse || (isFr ? '✓ En cours' : (isEn ? '✓ In Use' : '✓ En uso'));
        const btnLoad = t.manage?.btnLoad || (isFr ? 'Charger' : (isEn ? 'Load' : 'Cargar'));

        catalogGrids.forEach(catalogGrid => {
            catalogGrid.innerHTML = DECK_CATALOG.map(d => {
                const title = d.title[currentLang] || d.title.es;
                const isActive = Boolean(d.pattern && activePackName.includes(d.pattern));

                return `
          <div class="deck-catalog-card ${isActive ? 'is-active' : ''}" data-deck="${d.id}">
            <strong class="deck-title">${title}</strong>
            <div class="deck-split-btn-group">
              <button type="button" class="btn-deck-load ${isActive ? 'is-current' : ''}" data-deck-id="${d.id}" ${isActive ? 'disabled' : ''}>
                ${isActive ? btnInUse : btnLoad}
              </button>
              <a href="decks/${d.filename}" download="${d.filename}" class="btn-deck-zip" title="Descargar paquete ${d.filename}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>ZIP</span>
              </a>
            </div>
          </div>
        `;
            }).join('');

            catalogGrid.querySelectorAll('.btn-deck-load').forEach(btn => {
                btn.addEventListener('click', () => loadCatalogDeck(btn.dataset.deckId));
            });
        });
    }
}

/**
 * Actualiza el estado visual de los botones de la biblioteca (ej: 'Cargar' vs '✓ En uso')
 * para reflejar con precisión qué expansión se encuentra cargada en memoria.
 */
function updateActiveDeckCatalogState() {
    const currentName = (currentPackInfo.name || '').toLowerCase();
    const t = (typeof i18n !== 'undefined' && i18n[currentLang]) || (typeof i18n !== 'undefined' && i18n.es) || {};
    const activeLabel = t.manage?.btnInUse || (currentLang === 'fr' ? 'En uso' : (currentLang === 'en' ? 'In Use' : 'En uso'));
    const loadLabel = t.manage?.btnLoad || (currentLang === 'fr' ? 'Charger' : (currentLang === 'en' ? 'Load' : 'Cargar'));

    DECK_CATALOG.forEach(d => {
        const cardEls = document.querySelectorAll(`.deck-catalog-card[data-deck="${d.id}"]`);
        const isActive = Boolean(d.pattern && currentName.includes(d.pattern));

        cardEls.forEach(cardEl => {
            cardEl.classList.toggle('is-active', isActive);
            const pill = cardEl.querySelector('.deck-status-pill');
            if (pill) pill.textContent = activeLabel;

            const btnEl = cardEl.querySelector('.btn-deck-load');
            if (btnEl) {
                if (isActive) {
                    btnEl.classList.add('is-current');
                    btnEl.textContent = activeLabel;
                    btnEl.disabled = true;
                } else {
                    btnEl.classList.remove('is-current');
                    btnEl.textContent = loadLabel;
                    btnEl.disabled = false;
                }
            }
        });
    });
}

// =============================================================================
// SECCIÓN 8: PIPELINE DE INGESTA, DESCOMPRESIÓN Y PROCESAMIENTO DE PAQUETES ZIP
// =============================================================================
/**
 * Controla la barra de progreso global y la animación de apertura de sobres durante la carga de mazos.
 * 
 * @param {boolean} visible - Si debe mostrarse u ocultarse el modal de progreso.
 * @param {string} [text=''] - Mensaje explicativo del paso actual.
 * @param {number} [pct=0] - Porcentaje numérico completado (0 a 100).
 * @param {string} [title=''] - Título de cabecera del proceso.
 */
function showZipProgress(visible, text = '', pct = 0, title = '') {
    const normalContent = document.getElementById('zipCardNormalContent');
    const loadingContent = document.getElementById('zipCardLoadingContent');
    const welcomeHeader = document.getElementById('zipWelcomeHeader') || document.querySelector('.zip-welcome-header');
    const uploadCard = document.getElementById('zipUploadCard');
    const uploadScreen = document.getElementById('zipUploadScreen');
    const globalModal = document.getElementById('globalLoadingModal');

    const statusEl = document.getElementById('zipProgressStatus');
    const pctEl = document.getElementById('zipProgressPct');
    const fillEl = document.getElementById('zipProgressBarFill');

    const globalTitleEl = document.getElementById('globalLoadingTitle');
    const globalStatusEl = document.getElementById('globalLoadingStatus');
    const globalPctEl = document.getElementById('globalLoadingPct');
    const globalFillEl = document.getElementById('globalProgressBarFill');

    const printModal = document.getElementById('printModal');
    const isPrintModalOpen = Boolean(printModal && printModal.style.display === 'flex');
    const isUploadScreenVisible = Boolean(uploadScreen && window.getComputedStyle(uploadScreen).display !== 'none');

    if (visible) {
        if (!isPrintModalOpen && !title && isUploadScreenVisible) {
            if (welcomeHeader) welcomeHeader.style.display = 'none';
            if (normalContent) normalContent.style.display = 'none';
            if (loadingContent) loadingContent.style.display = 'flex';
            if (uploadCard) uploadCard.classList.add('is-loading-mode');
            if (statusEl && text) statusEl.textContent = text;
            if (pctEl) pctEl.textContent = `${pct}%`;
            if (fillEl) fillEl.style.width = `${pct}%`;
        } else {
            if (globalModal) {
                globalModal.style.display = 'flex';
                globalModal.style.zIndex = '99999';
            }
            if (globalTitleEl) globalTitleEl.textContent = title || 'Cargando...';
            if (globalStatusEl && text) globalStatusEl.textContent = text;
            if (globalPctEl) globalPctEl.textContent = `${pct}%`;
            if (globalFillEl) globalFillEl.style.width = `${pct}%`;
        }
    } else {
        if (welcomeHeader) welcomeHeader.style.display = '';
        if (normalContent) normalContent.style.display = 'block';
        if (loadingContent) loadingContent.style.display = 'none';
        if (uploadCard) uploadCard.classList.remove('is-loading-mode');
        if (globalModal) globalModal.style.display = 'none';
    }
}

async function loadZipPackage(zipSource, fileName = 'paquete.zip', saveToDB = true) {
    showZipProgress(true, 'Abriendo archivo ZIP...', 5);

    try {
        if (typeof JSZip === 'undefined') {
            throw new Error('La librería JSZip no está disponible.');
        }

        const zip = await JSZip.loadAsync(zipSource);
        showZipProgress(true, 'Buscando base de datos de cartas...', 20);

        // Locate cards.json inside the ZIP
        let jsonEntry = null;
        let jsonName = '';
        for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lower = path.toLowerCase();
            if (lower.endsWith('cards.json')) {
                jsonEntry = entry;
                jsonName = path;
                break;
            }
            if (!jsonEntry && lower.endsWith('.json') && !lower.includes('manifest') && !lower.includes('package')) {
                jsonEntry = entry;
                jsonName = path;
            }
        }

        if (!jsonEntry) {
            throw new Error('No se encontró ningún archivo "cards.json" dentro del .zip');
        }

        showZipProgress(true, `Leyendo ${jsonName}...`, 30);
        const jsonText = await jsonEntry.async('string');
        let raw = null;
        try {
            raw = JSON.parse(jsonText);
        } catch (e) {
            throw new Error(`Error en el formato de ${jsonName}: ${e.message}`);
        }

        // Extract all card images
        const imageEntries = [];
        for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            if (/\.(png|jpe?g|webp|svg|gif)$/i.test(path)) {
                imageEntries.push({ path, entry });
            }
        }

        const totalImages = imageEntries.length;
        showZipProgress(true, `Extrayendo ${totalImages} imágenes...`, 35);

        // Free previous blob URLs to prevent memory leaks
        for (const url of zipImageBlobUrls.values()) {
            URL.revokeObjectURL(url);
        }
        zipImageBlobUrls.clear();

        function getZipImageMime(filename) {
            const ext = (filename || '').split('.').pop().toLowerCase();
            if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
            if (ext === 'png') return 'image/png';
            if (ext === 'webp') return 'image/webp';
            if (ext === 'svg') return 'image/svg+xml';
            if (ext === 'gif') return 'image/gif';
            return 'image/jpeg';
        }

        for (let i = 0; i < totalImages; i++) {
            const { path, entry } = imageEntries[i];
            const mime = getZipImageMime(path);
            const buffer = await entry.async('arraybuffer');
            const blob = new Blob([buffer], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            const normPath = path.replace(/\\/g, '/');
            const lowerPath = normPath.toLowerCase();
            const basename = normPath.split('/').pop().toLowerCase();

            zipImageBlobUrls.set(normPath, blobUrl);
            zipImageBlobUrls.set(lowerPath, blobUrl);
            zipImageBlobUrls.set(basename, blobUrl);

            // Support subfolders (e.g. pack_name/images/...)
            const parts = normPath.split('/');
            if (parts.length > 1) {
                const subPath = parts.slice(1).join('/');
                zipImageBlobUrls.set(subPath, blobUrl);
                zipImageBlobUrls.set(subPath.toLowerCase(), blobUrl);
            }

            if ((i + 1) % 15 === 0 || (i + 1) === totalImages) {
                const pct = Math.round(35 + ((i + 1) / totalImages) * 55);
                showZipProgress(true, `Extrayendo imágenes (${i + 1}/${totalImages})...`, pct);
            }
        }

        showZipProgress(true, 'Configurando cartas...', 95);

        // Persist in IndexedDB if requested
        if (saveToDB && (zipSource instanceof Blob || zipSource instanceof File)) {
            await saveZipToIndexedDB(zipSource, fileName);
        }

        // Parse cards data structure
        currentDeckRaw = raw;
        if (raw.cards && Array.isArray(raw.cards)) {
            cardsData = raw.cards;
            setsData = raw.sets || {};
            playerIconsData = raw.player_icons || [];
            const titleStr = typeof raw.title === 'string' ? raw.title : (typeof raw.title === 'object' && raw.title ? Object.values(raw.title).join(' ') : '');
            currentPackCollection = raw.collection || raw.collection_name || (titleStr.includes('Pokémon') || fileName?.includes('pokemon') ? 'Edición Pokémon' : null);
        } else if (Array.isArray(raw)) {
            cardsData = raw;
            setsData = {};
            playerIconsData = [];
            currentPackCollection = fileName?.includes('pokemon') ? 'Edición Pokémon' : null;
        } else {
            throw new Error('Estructura de cartas no reconocida en el JSON.');
        }

        const countEl = document.getElementById('totalCount');
        if (countEl) countEl.textContent = cardsData.length;

        hideZipUploadScreen(fileName);
        showZipProgress(false);

        // Reset filters to defaults for new loaded deck
        selectedGame = 'all';
        selectedColor = 'all';
        selectedLevel = 'all';
        selectedStrength = 'all';
        searchQuery = '';
        activeFactionTab = 'all';

        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        buildFactionBookmarks();
        buildFilterChips();
        renderCards();
        updateActiveFiltersIndicator();

        showToast(`¡Mazo "${fileName}" cargado con éxito! (${cardsData.length} cartas)`, 'success');
    } catch (err) {
        console.error('Error cargando ZIP:', err);
        showZipProgress(false);
        showToast(`Error al procesar el archivo ZIP: ${err.message}`, 'error');
    }
}

function setupZipUploadHandlers() {
    const fileInput = document.getElementById('zipFileInput');
    const selectBtn = document.getElementById('zipSelectBtn');
    const managerBtn = document.getElementById('zipManagerBtn');
    const manageModal = document.getElementById('zipManageModal');
    const manageCloseBtn = document.getElementById('zipManageCloseBtn');
    const changePackBtn = document.getElementById('zipChangePackBtn');
    const welcomeUploadBox = document.getElementById('zipWelcomeUploadBox');
    const removePackBtn = document.getElementById('zipRemovePackBtn');

    if (selectBtn && fileInput) {
        selectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
                if (manageModal) manageModal.style.display = 'none';
                await loadZipPackage(file, file.name, true);
                fileInput.value = '';
            }
        });
    }

    function setupBoxHandlers(box) {
        if (!box) return;
        box.addEventListener('click', (e) => {
            if (e.target && e.target.tagName !== 'INPUT') {
                if (manageModal) manageModal.style.display = 'none';
                if (fileInput) fileInput.click();
            }
        });

        box.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (manageModal) manageModal.style.display = 'none';
                if (fileInput) fileInput.click();
            }
        });

        box.addEventListener('dragover', (e) => {
            e.preventDefault();
            box.classList.add('is-dragover');
        });

        box.addEventListener('dragleave', (e) => {
            e.preventDefault();
            box.classList.remove('is-dragover');
        });

        box.addEventListener('drop', async (e) => {
            e.preventDefault();
            box.classList.remove('is-dragover');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.name.toLowerCase().endsWith('.zip')) {
                    if (manageModal) manageModal.style.display = 'none';
                    await loadZipPackage(file, file.name, true);
                } else {
                    showToast('Por favor, selecciona un archivo con extensión .zip', 'error');
                }
            }
        });
    }

    setupBoxHandlers(welcomeUploadBox);
    setupBoxHandlers(changePackBtn);

    // Generic Decks Catalog Rendering (Modal cards & Welcome screen cards)
    renderDeckCatalogUI();

    // ZIP Pack Manager Button in Header
    if (managerBtn) {
        managerBtn.addEventListener('click', () => {
            if (cardsData.length === 0) {
                if (fileInput) fileInput.click();
            } else {
                if (manageModal) {
                    updateActiveDeckCatalogState();
                    manageModal.style.display = 'flex';
                }
            }
        });
    }

    if (manageCloseBtn && manageModal) {
        manageCloseBtn.addEventListener('click', () => {
            manageModal.style.display = 'none';
        });
        manageModal.addEventListener('click', (e) => {
            if (e.target === manageModal) manageModal.style.display = 'none';
        });
    }

    const openGuideBtn = document.getElementById('btnOpenTemplateGuide');
    const openGuideFromManageBtn = document.getElementById('btnOpenGuideFromManage');
    const guideModal = document.getElementById('templateGuideModal');

    [openGuideBtn, openGuideFromManageBtn].forEach(btn => {
        if (btn && guideModal) {
            btn.addEventListener('click', () => {
                guideModal.style.display = 'flex';
            });
        }
    });

    if (removePackBtn) {
        removePackBtn.addEventListener('click', async () => {
            const t = i18n[currentLang] || i18n.es;
            const confirmText = t.manage?.confirmRemove || (currentLang === 'fr'
                ? 'Voulez-vous supprimer le paquet sauvegardé et revenir à l\'écran de chargement ?'
                : (currentLang === 'en'
                    ? 'Do you want to delete the saved card deck and return to the upload screen?'
                    : '¿Deseas eliminar el mazo de cartas guardado y volver a la pantalla de carga?'));
            if (confirm(confirmText)) {
                await clearZipFromIndexedDB();
                cardsData = [];
                for (const url of zipImageBlobUrls.values()) {
                    URL.revokeObjectURL(url);
                }
                zipImageBlobUrls.clear();
                if (manageModal) manageModal.style.display = 'none';
                showZipUploadScreen();
                renderCards();
                const toastMsg = currentLang === 'fr'
                    ? 'Deck supprimé. Prêt à charger un nouveau fichier.'
                    : (currentLang === 'en'
                        ? 'Deck removed. Ready to load a new file.'
                        : 'Mazo eliminado. Listo para cargar un nuevo archivo.');
                showToast(toastMsg, 'info');
            }
        });
    }

    // Template Guide Modal Close Handlers
    const closeGuideBtn = document.getElementById('guideCloseBtn');
    if (closeGuideBtn && guideModal) {
        closeGuideBtn.addEventListener('click', () => {
            guideModal.style.display = 'none';
        });
        guideModal.addEventListener('click', (e) => {
            if (e.target === guideModal) guideModal.style.display = 'none';
        });
    }
}


// Code dictionary for supported languages (clean text, no flag emojis)
const langFlags = {
    es: 'ES',
    fr: 'FR',
    en: 'EN',
    de: 'DE',
    nl: 'NL',
    it: 'IT'
};

// Set Active Language
// =============================================================================
// SECCIÓN 9: GESTIÓN DE IDIOMA Y MODOS DE VISUALIZACIÓN
// =============================================================================
/**
 * Cambia el idioma activo de la aplicación y actualiza todos los textos del DOM y plantillas de carta.
 * 
 * @param {string} lang - Código de idioma destino ('es', 'fr', 'en', 'de', 'nl', 'it').
 */
function setLanguage(lang) {
    if (!lang) return;
    currentLang = lang;

    // Update Language Code Badge and Dropdown
    const flagEl = document.getElementById('currentLangFlag');
    if (flagEl) {
        flagEl.textContent = langFlags[lang] || lang.toUpperCase();
    }
    const langSelect = document.getElementById('langSelectDropdown');
    if (langSelect && langSelect.value !== lang) {
        langSelect.value = lang;
    }

    // Update legacy buttons if present
    const btnEs = document.getElementById('btnLangEs');
    if (btnEs) btnEs.classList.toggle('active', lang === 'es');
    const btnFr = document.getElementById('btnLangFr');
    if (btnFr) btnFr.classList.toggle('active', lang === 'fr');
    const btnEn = document.getElementById('btnLangEn');
    if (btnEn) btnEn.classList.toggle('active', lang === 'en');

    updateUIStrings();
    renderDeckCatalogUI();
    updateNavbarVisibility();
    buildFilterChips();
    buildFactionBookmarks();
    renderCards();

    // If card detail modal is open, re-render it
    if (currentModalCardIndex >= 0) {
        renderModalCard(currentModalCardIndex);
    }

    // If print modal is open, re-render print preview
    const printModal = document.getElementById('printModal');
    if (printModal && printModal.style.display === 'flex' && typeof renderPrintPreview === 'function') {
        renderPrintPreview(previewCurrentPage);
    }
}

// Set View Mode ('template' vs 'photo')
/**
 * Conmuta el modo de representación visual de las cartas:
 * - 'template': Renderizado vectorial dinámico con textos y marcos generados.
 * - 'photo': Visualización de la ilustración o carta digital original en alta resolución.
 * 
 * @param {'template'|'photo'} mode - Modo de visualización solicitado.
 */
function setViewMode(mode) {
    if (currentViewMode === mode) return;
    currentViewMode = mode;

    const btnT = document.getElementById('btnModeTemplate');
    const btnP = document.getElementById('btnModePhoto');
    if (btnT) btnT.classList.toggle('active', mode === 'template');
    if (btnP) btnP.classList.toggle('active', mode === 'photo');

    if (mode === 'photo') {
        cardsData.forEach(c => flippedCardIds.add(c.id));
        allFlippedState = true;
    } else {
        flippedCardIds.clear();
        allFlippedState = false;
    }

    document.querySelectorAll('.card-item').forEach(el => {
        const id = parseInt(el.dataset.id, 10);
        el.classList.toggle('is-flipped', flippedCardIds.has(id));
    });
}

// Toggle Flip All Cards
/**
 * Alterna el volteo 3D masivo de todas las cartas visibles en la galería entre anverso y reverso.
 */
function toggleFlipAll() {
    allFlippedState = !allFlippedState;

    if (allFlippedState) {
        visibleCardIds.forEach(id => flippedCardIds.add(id));
    } else {
        visibleCardIds.forEach(id => flippedCardIds.delete(id));
    }

    document.querySelectorAll('.card-item').forEach(el => {
        const id = parseInt(el.dataset.id, 10);
        el.classList.toggle('is-flipped', flippedCardIds.has(id));
    });
}

// Toggle Individual Card Flip
/**
 * Invierte el estado de volteo 3D individual de una carta específica.
 * 
 * @param {number|string} cardId - Identificador único de la carta.
 * @param {Event} [event] - Evento DOM disparador (para detener propagación).
 */
function toggleCardFlip(cardId, event) {
    if (event) event.stopPropagation();

    if (flippedCardIds.has(cardId)) {
        flippedCardIds.delete(cardId);
    } else {
        flippedCardIds.add(cardId);
    }

    const cardElement = document.querySelector(`.card-item[data-id="${cardId}"]`);
    if (cardElement) {
        cardElement.classList.toggle('is-flipped', flippedCardIds.has(cardId));
    }
}

// Update Static UI Texts based on current language
/**
 * Aplica los textos traducidos del diccionario i18n activo a todos los elementos del DOM.
 */
function updateUIStrings() {
    const t = i18n[currentLang] || i18n.es;
    if (!t) return;

    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text !== undefined) el.textContent = text;
    };

    const setSafeHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el && html !== undefined) el.innerHTML = html;
    };

    // Base Header & Controls
    setSafeText('headerSubtitle', t.subtitle);
    setSafeText('langLabel', t.langLabel);
    setSafeText('viewModeLabel', t.viewModeLabel);
    setSafeText('txtModeTemplate', t.templateMode);
    setSafeText('txtModePhoto', t.photoMode);

    const searchInput = document.getElementById('searchInput');
    if (searchInput && t.searchPlaceholder) {
        searchInput.placeholder = t.searchPlaceholder;
    }

    setSafeText('txtResetFilters', t.resetFilters);
    setSafeText('txtSidebarTitle', t.filters || 'Filtros');

    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn) {
        toggleBtn.title = t.filters || 'Filtros';
        toggleBtn.setAttribute('aria-label', t.filters || 'Filtros');
    }

    const flipBtn = document.getElementById('flipAllBtn');
    if (flipBtn) {
        flipBtn.title = t.flipAll || 'Voltear cartas';
        flipBtn.setAttribute('aria-label', t.flipAll || 'Voltear cartas');
    }
    setSafeText('filterGameTitle', t.filterGameTitle);
    setSafeText('filterColorTitle', t.filterColorTitle);
    setSafeText('filterLevelTitle', t.filterLevelTitle);
    setSafeText('filterStrengthTitle', t.filterStrengthTitle);
    setSafeText('countLabel', t.countLabel);
    setSafeText('noResultsTitle', t.noResultsTitle);
    setSafeText('noResultsText', t.noResultsText);
    setSafeText('btnResetFromEmpty', t.btnReset);

    // Footer text localization
    setSafeText('txtFooterBrand', t.footerBrand);
    setSafeText('txtFooterDesc', t.footerDesc);
    setSafeText('footerBtnDisclaimer', t.footerDisclaimer);
    setSafeText('footerBtnScrollTop', t.footerScrollTop);

    // Header action buttons
    const flipBtnSpan = document.querySelector('#flipAllBtn span');
    if (flipBtnSpan && t.headerFlipAll) flipBtnSpan.textContent = t.headerFlipAll;
    const printBtnSpan = document.querySelector('#openPrintModalBtn span');
    if (printBtnSpan && t.headerPrint) printBtnSpan.textContent = t.headerPrint;
    const zipBtnSpan = document.querySelector('#zipManagerBtn span');
    if (zipBtnSpan && t.headerDeck) zipBtnSpan.textContent = t.headerDeck;

    // Onboarding Screen
    if (t.onboarding) {
        setSafeText('zipUploadTitle', t.onboarding.title);
        setSafeText('zipUploadDesc', t.onboarding.desc);
        setSafeText('zipDropText', t.onboarding.dropText);
        setSafeText('zipDropSubtext', t.onboarding.dropSubtext);
        setSafeText('zipSelectBtn', t.onboarding.btnSelect);
    }

    // Loading Modals
    setSafeText('globalLoadingTitle', t.loadingTitle);
    setSafeText('globalLoadingStatus', t.loadingStatus);
    setSafeText('zipLoadingTitle', t.loadingTitle);
    setSafeText('zipProgressStatus', t.loadingStatus);

    // Print & Export Modal
    if (t.print) {
        setSafeText('printModalTitle', t.print.modalTitle);
        setSafeText('printTabBtnSelection', t.print.tabSelection);
        setSafeText('printTabBtnFormat', t.print.tabFormat);
        setSafeText('printQuickSelectLabel', t.print.quickFiltersTitle);
        setSafeText('btnSelectAllCards', t.print.btnAll);
        setSafeText('txtBtnSelectFiltered', t.print.btnFiltered);
        setSafeText('btnDeselectAllCards', t.print.btnDeselect);
        setSafeText('printFactionSelectLabel', t.print.factionSelectTitle);
        setSafeText('btnSelectAllFactions', t.print.btnAllFactions);
        setSafeText('btnDeselectAllFactions', t.print.btnNoneFactions);
        setSafeText('printQtyDistLabel', t.print.qtyDistTitle);
        setSafeText('btnPresetOfficialDeck', t.print.presetOfficial);
        setSafeText('btnPresetSingleCopy', t.print.presetSingle);
        setSafeText('printMetricUniqueLabel', t.print.metricUnique);
        setSafeText('printMetricCardsLabel', t.print.metricCards);
        setSafeText('printMetricPagesLabel', t.print.metricPages);
        setSafeText('printListToggleText', t.print.listToggleText);
        setSafeText('printListFilterLabel', t.print.listFactionFilterLabel);
        setSafeText('printListAllFactionsOption', t.print.allFactionsOption);
        setSafeText('printFormLangLabel', t.print.langLabel);
        setSafeText('printFormLayoutLabel', t.print.layoutLabel);
        setSafeText('printLayoutTemplateTitle', t.print.layoutTemplateTitle);
        setSafeText('printLayoutTemplateBadge', t.print.layoutTemplateBadge);
        setSafeText('printLayoutTemplateDesc', t.print.layoutTemplateDesc);
        setSafeText('printLayoutBgaTitle', t.print.layoutBgaTitle);
        setSafeText('printLayoutBgaDesc', t.print.layoutBgaDesc);
        setSafeText('printLayoutStripsTitle', t.print.layoutStripsTitle);
        setSafeText('printLayoutStripsDesc', t.print.layoutStripsDesc);
        setSafeText('printWhiteMarginText', t.print.whiteMarginLabel);
        setSafeText('txtPrintSummaryPage', t.print.summaryPageLabel || 'Incluir primera página con portada y resumen del pack (1 hoja A4)');
        setSafeText('printCutGuidesLabel', t.print.cutGuidesLabel);
        setSafeText('printCutCrossesLabel', t.print.cutCrosses);
        setSafeText('printCutGridLabel', t.print.cutGrid);
        setSafeText('printCutNoneLabel', t.print.cutNone);
        setSafeText('printArtAdjustLabel', t.print.artAdjustLabel);
        setSafeText('printArtFitLabel', t.print.artFitLabel);
        setSafeText('optArtContain', t.print.artFitContain);
        setSafeText('optArtCover', t.print.artFitCover);
        setSafeText('optArtFitHeight', t.print.artFitHeight);
        setSafeText('optArtFitWidth', t.print.artFitWidth);
        setSafeText('printArtScaleLabel', t.print.artScaleLabel);
        setSafeText('txtCompoundDownloadLabel', t.print.downloadLabel || 'Descargar:');
        setSafeText('txtBtnDownloadPDF', t.print.btnDownloadPDFStandard || 'Plantilla PDF');
        setSafeText('txtBtnDownloadImages', t.print.btnDownloadImages || 'Cartas como imagen');
        const printIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>`;
        const btnPrintDirectEl = document.getElementById('btnPrintDirect');
        if (btnPrintDirectEl) {
            btnPrintDirectEl.innerHTML = `${printIcon} <span id="txtBtnPrintDirect">${t.print.btnPrintDirect || 'Imprimir en navegador'}</span>`;
        }
        setSafeText('printPreviewTitle', t.print.previewTitle);
    }

    // Deck Management Modal
    if (t.manage) {
        setSafeText('zipManageModalTitle', t.manage.modalTitle);
        setSafeText('zipManageModalSubtitle', t.manage.modalSubtitle);
        setSafeText('txtZipManageActiveBadge', t.manage.activeBadge);
        if (typeof cardsData !== 'undefined' && cardsData.length > 0 && typeof t.manage.loadedCards === 'function') {
            setSafeText('zipCurrentPackMeta', t.manage.loadedCards(cardsData.length));
        }
        setSafeText('zipManageSec1Title', t.manage.sectionCatalog || t.manage.sectionChange);
        setSafeText('zipManageSec1Hint', t.manage.sectionCatalogHint);
        setSafeText('txtBtnChangePack', t.manage.btnChangePack);
        setSafeText('txtBtnChangePackSub', t.manage.btnChangePackSub);
        setSafeText('txtBtnChangePackBadge', t.manage.btnChangePackBadge || 'Examinar...');
        setSafeText('txtZipResourcesLabel', t.manage.resourcesLabel || 'Recursos:');
        setSafeText('zipDownloadTemplateInModal', t.manage.downloadTemplate);
        setSafeText('btnOpenGuideFromManage', t.manage.btnGuide || '📖 Guía creadores');
        setSafeText('txtBtnRemovePack', t.manage.btnRemovePack || t.manage.btnRemove);
        updateActiveDeckCatalogState();
    }

    // Creator Guide Modal
    if (t.guide) {
        setSafeText('guideModalTitle', t.guide.modalTitle);
        setSafeText('guideModalSubtitle', t.guide.modalSubtitle);
        setSafeText('guideModalIntro', t.guide.intro);
        setSafeText('guideSec1Title', t.guide.sectionStructure);
        setSafeText('guideSec2Title', t.guide.tableTitle);
        setSafeText('guideThField', t.guide.thField);
        setSafeText('guideThType', t.guide.thType);
        setSafeText('guideThDesc', t.guide.thDesc);
        setSafeHtml('guideDescId', t.guide.descId);
        setSafeHtml('guideDescLevel', t.guide.descLevel);
        setSafeHtml('guideDescStrength', t.guide.descStrength);
        setSafeHtml('guideDescSetId', t.guide.descSetId);
        setSafeHtml('guideDescCopies', t.guide.descCopies);
        setSafeHtml('guideDescArt', t.guide.descArt);
        setSafeHtml('guideDescLocales', t.guide.descLocales);
        setSafeHtml('guideCtaText', t.guide.ctaText);
        setSafeText('guideDownloadBtn', t.guide.downloadBtn);
    }

    // Disclaimer Modal
    if (t.disclaimer) {
        setSafeText('disclaimerModalTitle', t.disclaimer.modalTitle);
        setSafeText('disclaimerModalSubtitle', t.disclaimer.modalSubtitle);
        setSafeText('disclaimerLead', t.disclaimer.lead);
        setSafeText('disclaimerSec1Title', t.disclaimer.sec1Title);
        setSafeHtml('disclaimerSec1Text', t.disclaimer.sec1Text);
        setSafeText('disclaimerSec2Title', t.disclaimer.sec2Title);
        setSafeHtml('disclaimerSec2Text', t.disclaimer.sec2Text);
        setSafeText('disclaimerSec3Title', t.disclaimer.sec3Title);
        setSafeHtml('disclaimerSec3Text', t.disclaimer.sec3Text);
        setSafeText('disclaimerAcceptBtn', t.disclaimer.btnUnderstood);
    }

    // Update Print Badge & List if active
    if (typeof updatePrintBadge === 'function') {
        updatePrintBadge();
    }
    if (typeof isCardListOpen !== 'undefined' && isCardListOpen && typeof renderCardQuantityList === 'function') {
        renderCardQuantityList();
    }
}

// Render Header for Active Faction in Content Box
/**
 * Actualiza el encabezado de la facción o sección activa con el desglose de cartas y copias físicas.
 * 
 * @param {number} filteredCount - Número de cartas únicas visibles.
 * @param {number} filteredCopies - Total de cartas físicas sumando sus copias.
 */
function renderFactionHeader(filteredCount, filteredCopies) {
    const banner = document.getElementById('factionHeaderBanner');
    if (!banner) return;

    const currentTab = FACTION_TABS.find(t => t.id === activeFactionTab) || FACTION_TABS[0];
    if (!currentTab) return;
    const setInfo = setsData[currentTab.id] || (currentTab.id === 'starter' ? setsData['city'] : null);
    const t = i18n[currentLang] || i18n.es;
    const tabNames = t.factionTabNames || {};
    const name = setInfo?.name?.[currentLang] || setInfo?.name?.es || tabNames[currentTab.nameKey] || currentTab.defaultName || currentTab.id;

    const customIcon = setInfo?.icon_path || currentTab.icon;
    const tabColor = setInfo?.color_hex || currentTab.color;

    let iconHtml = '';
    if (customIcon) {
        iconHtml = `<img src="${getFactionIconPath(customIcon)}" alt="" class="faction-header-icon-img">`;
    } else if (currentTab.iconType === 'img' && currentTab.icon) {
        iconHtml = `<img src="${getFactionIconPath(currentTab.icon)}" alt="" class="faction-header-icon-img">`;
    } else if (currentTab.svgIcon) {
        iconHtml = `<span class="faction-header-icon-svg" style="color: ${tabColor || '#0284c7'};">${currentTab.svgIcon}</span>`;
    }

    // Determine subtitle without duplicating the faction name
    let subtitle = '';
    if (currentTab.id === 'all') {
        subtitle = currentLang === 'fr' ? 'Collection complète' : (currentLang === 'en' ? 'Complete collection' : (currentLang === 'de' ? 'Komplette Sammlung' : (currentLang === 'nl' ? 'Volledige collectie' : (currentLang === 'it' ? 'Collezione completa' : 'Colección completa'))));
    } else if (currentTab.id === 'starter') {
        subtitle = currentLang === 'fr' ? 'Deck initial · Niveau S' : (currentLang === 'en' ? 'Starter deck · Level S' : (currentLang === 'de' ? 'Starter-Deck · Stufe S' : (currentLang === 'nl' ? 'Startdeck · Niveau S' : (currentLang === 'it' ? 'Mazzo iniziale · Livello S' : 'Mazo inicial · Nivel S'))));
    } else if (currentTab.id === 'robot') {
        subtitle = currentLang === 'fr' ? 'Mode Solo / Automatique' : (currentLang === 'en' ? 'Solo / Automated Mode' : (currentLang === 'de' ? 'Solo-Modus / Automatisch' : (currentLang === 'nl' ? 'Solo-modus / Automatisch' : (currentLang === 'it' ? 'Modalità Solo / Automatica' : 'Modo Solo / Automático'))));
    } else {
        // Only display if there's a distinct edition or collection name
        const sampleCard = cardsData.find(currentTab.filterFn);
        const colName = getCardCollectionName(sampleCard);
        if (colName && colName.trim().toLowerCase() !== name.trim().toLowerCase()) {
            subtitle = colName;
        } else if (currentTab.badge && currentTab.badge.trim().toLowerCase() !== name.trim().toLowerCase()) {
            subtitle = currentTab.badge;
        }
    }

    const cardsLabel = currentLang === 'fr' ? 'cartes' : (currentLang === 'en' ? 'cards' : (currentLang === 'de' ? 'Karten' : (currentLang === 'nl' ? 'kaarten' : (currentLang === 'it' ? 'carte' : 'cartas'))));
    const copiesLabel = currentLang === 'fr' ? 'copies' : (currentLang === 'en' ? 'copies' : (currentLang === 'de' ? 'Kopien' : (currentLang === 'nl' ? 'kopieën' : (currentLang === 'it' ? 'copie' : 'copias'))));
    const infoBtnTitle = currentLang === 'fr' ? 'Informations, univers et détail du deck' : (currentLang === 'en' ? 'Deck information, lore and breakdown' : (currentLang === 'de' ? 'Deck-Informationen, Hintergrundgeschichte und Aufteilung' : (currentLang === 'nl' ? 'Deck-informatie, achtergrond en uitsplitsing' : (currentLang === 'it' ? 'Informazioni, ambientazione e composizione del mazzo' : 'Información, trasfondo y desglose del mazo'))));

    banner.innerHTML = `
    <div class="faction-header-left">
      ${iconHtml ? `<div class="faction-header-icon">${iconHtml}</div>` : ''}
      <div class="faction-header-info">
        <h2 class="faction-header-title">${name}</h2>
        ${subtitle ? `<span class="faction-header-subtitle">${subtitle}</span>` : ''}
      </div>
    </div>
    <div class="faction-header-actions">
      <div class="faction-header-stats">
        <span class="faction-stat-item"><strong>${filteredCount}</strong> ${cardsLabel}</span>
        <span class="faction-stat-sep">·</span>
        <span class="faction-stat-item"><strong>${filteredCopies}</strong> ${copiesLabel}</span>
      </div>
      <button type="button" class="deck-info-help-btn" id="btnDeckInfoModal" title="${infoBtnTitle}" aria-label="${infoBtnTitle}">?</button>
    </div>
  `;

    const infoBtn = banner.querySelector('#btnDeckInfoModal');
    if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeckInfoModal();
        });
    }
}

// Extract structured deck summary data for both the "?" info modal and the printed A4 summary sheet
// =============================================================================
// SECCIÓN 10: GENERACIÓN DE RESÚMENES, FICHAS Y PORTADAS A4 MULTIPÁGINA
// =============================================================================
/**
 * Compila y estructura los datos y estadísticas del mazo activo para la generación de la portada A4.
 * Genera el desglose por niveles (Nivel S, A, B, C, Entrenadores, Robot) y listas de cartas.
 * 
 * @param {string} [lang=currentLang] - Código de idioma para textos y etiquetas.
 * @returns {Object} Objeto enriquecido con estadísticas, reglas de balance y desglose por facciones.
 */
function getDeckSummaryData(lang = currentLang) {
    const info = currentDeckRaw?.info || null;

    const modalI18n = {
        es: {
            defaultTitle: 'Información del Mazo',
            defaultSubtitle: 'Detalles, trasfondo y desglose de contenido',
            editionCol: 'Edición / Colección',
            authorCreator: 'Autor / Creador',
            version: 'Versión',
            totalVolume: 'Volumen total',
            factions: 'facciones',
            cards: 'cartas',
            copies: 'copias',
            description: 'Descripción',
            loreUniverse: 'Trasfondo Temático',
            balanceRules: 'Equilibrio y Reglas de Juego',
            factionBreakdown: 'Desglose de Facciones',
            basedOn: 'Basado en',
            level: 'Nivel',
            distribution: 'Distribución',
            cardsCol: 'Cartas',
            unique: 'únicas',
            summarySheetSub: 'Ficha Oficial de Expansión y Referencia'
        },
        fr: {
            defaultTitle: 'Informations du Deck',
            defaultSubtitle: 'Détails, lore et composition',
            editionCol: 'Édition / Collection',
            authorCreator: 'Auteur / Créateur',
            version: 'Version',
            totalVolume: 'Volume total',
            factions: 'factions',
            cards: 'cartes',
            copies: 'copies',
            description: 'Description',
            loreUniverse: 'Contexte et Univers',
            balanceRules: 'Équilibre et Règles',
            factionBreakdown: 'Détail des Factions',
            basedOn: 'Basé sur',
            level: 'Niveau',
            distribution: 'Distribution',
            cardsCol: 'Cartes',
            unique: 'uniques',
            summarySheetSub: 'Fiche Résumé et Référence d\'Extension'
        },
        en: {
            defaultTitle: 'Deck Information',
            defaultSubtitle: 'Details, lore and composition',
            editionCol: 'Edition / Collection',
            authorCreator: 'Author / Creator',
            version: 'Version',
            totalVolume: 'Total volume',
            factions: 'factions',
            cards: 'cards',
            copies: 'copies',
            description: 'Description',
            loreUniverse: 'Lore and Universe',
            balanceRules: 'Game Balance and Rules',
            factionBreakdown: 'Faction Breakdown',
            basedOn: 'Based on',
            level: 'Level',
            distribution: 'Breakdown',
            cardsCol: 'Cards',
            unique: 'unique',
            summarySheetSub: 'Expansion Summary & Reference Sheet'
        },
        de: {
            defaultTitle: 'Deck-Informationen',
            defaultSubtitle: 'Details, Hintergrund und Inhaltsübersicht',
            editionCol: 'Edition / Sammlung',
            authorCreator: 'Autor / Ersteller',
            version: 'Version',
            totalVolume: 'Gesamtumfang',
            factions: 'Fraktionen',
            cards: 'Karten',
            copies: 'Exemplare',
            description: 'Beschreibung',
            loreUniverse: 'Hintergrund & Universum',
            balanceRules: 'Spielbalance und Regeln',
            factionBreakdown: 'Fraktionsübersicht',
            basedOn: 'Basiert auf',
            level: 'Stufe',
            distribution: 'Verteilung',
            cardsCol: 'Karten',
            unique: 'einzigartige',
            summarySheetSub: 'Deck-Zusammenfassung und Referenzblatt'
        },
        nl: {
            defaultTitle: 'Deck-informatie',
            defaultSubtitle: 'Details, achtergrond en inhoudsoverzicht',
            editionCol: 'Editie / Collectie',
            authorCreator: 'Auteur / Maker',
            version: 'Versie',
            totalVolume: 'Totale omvang',
            factions: 'facties',
            cards: 'kaarten',
            copies: 'exemplaren',
            description: 'Beschrijving',
            loreUniverse: 'Achtergrond & Universum',
            balanceRules: 'Spelbalans en Regels',
            factionBreakdown: 'Factie-overzicht',
            basedOn: 'Gebaseerd op',
            level: 'Niveau',
            distribution: 'Verdeling',
            cardsCol: 'Kaarten',
            unique: 'unieke',
            summarySheetSub: 'Deck-overzicht en Referentieblad'
        },
        it: {
            defaultTitle: 'Informazioni sul Mazzo',
            defaultSubtitle: 'Dettagli, ambientazione e composizione dei contenidos',
            editionCol: 'Edizione / Collezione',
            authorCreator: 'Autore / Creatore',
            version: 'Versione',
            totalVolume: 'Volume totale',
            factions: 'fazioni',
            cards: 'carte',
            copies: 'copie',
            description: 'Descrizione',
            loreUniverse: 'Ambientazione e Universo',
            balanceRules: 'Bilanciamento e Regole di Gioco',
            factionBreakdown: 'Dettaglio delle Fazioni',
            basedOn: 'Basato su',
            level: 'Livello',
            distribution: 'Distribuzione',
            cardsCol: 'Carte',
            unique: 'uniche',
            summarySheetSub: 'Scheda Riepilogo e Riferimento Espansione'
        }
    };

    const mT = modalI18n[lang] || modalI18n.es;

    // Header titles
    const titleObj = info?.title || currentDeckRaw?.title;
    let title = mT.defaultTitle;
    if (titleObj && typeof titleObj === 'object') {
        title = titleObj[lang] || titleObj.es || titleObj.en || mT.defaultTitle;
    } else if (typeof titleObj === 'string' && titleObj.trim()) {
        title = titleObj;
    }

    const subObj = info?.subtitle || currentPackCollection;
    let subtitle = mT.defaultSubtitle;
    if (subObj && typeof subObj === 'object') {
        subtitle = subObj[lang] || subObj.es || subObj.en || mT.defaultSubtitle;
    } else if (typeof subObj === 'string' && subObj.trim()) {
        subtitle = subObj;
    }

    // Author
    const catalogDeck = DECK_CATALOG.find(d => {
        const rawTitleStr = typeof currentDeckRaw?.title === 'object' ? Object.values(currentDeckRaw.title).join(' ') : (currentDeckRaw?.title || '');
        return (d.pattern && (rawTitleStr.toLowerCase().includes(d.pattern) || (currentPackCollection || '').toLowerCase().includes(d.pattern)));
    });
    let author = info?.author || currentDeckRaw?.author || currentDeckRaw?.creator || catalogDeck?.author || '';
    if (author && typeof author === 'object') {
        author = author[lang] || author.es || author.en || '';
    }
    if (!author) {
        const defaultAuthors = {
            es: 'Comunidad Challengers!',
            en: 'Challengers! Community',
            fr: 'Communauté Challengers!',
            de: 'Challengers! Community',
            nl: 'Challengers! Community',
            it: 'Community Challengers!'
        };
        author = defaultAuthors[lang] || 'Comunidad Challengers!';
    }

    const version = info?.version || currentDeckRaw?.version || '1.0';

    const collObj = currentPackCollection || currentDeckRaw?.collection || currentDeckRaw?.collection_name;
    let collectionName = '';
    if (collObj && typeof collObj === 'object') {
        collectionName = collObj[lang] || collObj.es || collObj.en || '';
    } else if (typeof collObj === 'string' && collObj.trim()) {
        collectionName = collObj;
    }
    if (!collectionName || collectionName === 'Personalizada') {
        collectionName = 'Personalizada';
    }

    const totalCards = cardsData.length;
    const totalCopies = cardsData.reduce((acc, c) => acc + (parseInt(c.default_copies) || 1), 0);
    const activeFactionsCount = Object.keys(setsData).length || new Set(cardsData.map(c => c.set_id)).size;

    // Description & Lore & Balance
    const descObj = info?.description || currentDeckRaw?.description;
    let descText = '';
    if (descObj && typeof descObj === 'object') {
        descText = descObj[lang] || descObj.es || descObj.en || '';
    } else if (typeof descObj === 'string') {
        descText = descObj;
    }

    const loreText = info?.lore?.[lang] || info?.lore?.es || '';
    const balanceText = info?.balance_notes?.[lang] || info?.balance_notes?.es || '';

    // Factions list
    const factions = [];
    if (info?.factions && Array.isArray(info.factions)) {
        info.factions.forEach(fac => {
            const facName = fac.name?.[lang] || fac.name?.es || fac.set_id;
            const baseSet = fac.official_base?.[lang] || fac.official_base?.es || '';
            const facDesc = fac.description?.[lang] || fac.description?.es || '';
            const color = fac.color_hex || '#0284c7';
            const iconUrl = fac.icon_path ? getFactionIconPath(fac.icon_path) : '';
            const setCards = cardsData.filter(c => c.set_id === fac.set_id);
            const levels = (fac.levels || []).map(lvl => {
                let cardList = typeof lvl.detail === 'object' ? (lvl.detail[lang] || lvl.detail.es || lvl.detail.en || '') : (lvl.detail || '');
                if (!cardList && setCards.length > 0) {
                    const lvlCards = setCards.filter(c => c.level === lvl.level);
                    cardList = lvlCards.map(c => {
                        const cName = c[lang]?.name || c.es?.name || c.name || 'Carta';
                        const cStr = c.strength !== undefined ? c.strength : '?';
                        return `${cName} (${cStr}, ${c.default_copies || 1}x)`;
                    }).join(', ');
                }
                return {
                    level: lvl.level,
                    unique_cards: lvl.unique_cards || lvl.unique || 0,
                    copies: lvl.copies || 0,
                    cardsDetail: cardList
                };
            });

            factions.push({
                id: fac.set_id,
                name: facName,
                baseSet,
                desc: facDesc,
                color,
                iconUrl,
                totalCards: fac.total_cards,
                totalCopies: fac.total_copies,
                levels
            });
        });
    } else {
        const setIds = [...new Set(cardsData.map(c => c.set_id).filter(Boolean))];
        setIds.forEach(setId => {
            const setCards = cardsData.filter(c => c.set_id === setId);
            if (setCards.length === 0) return;
            const setInfo = setsData[setId] || {};
            const setName = setInfo.name?.[lang] || setInfo.name?.es || setId;
            const color = setInfo.color_hex || '#0284c7';
            const iconUrl = setInfo.icon_path ? getFactionIconPath(setInfo.icon_path) : '';
            const setCopies = setCards.reduce((acc, c) => acc + (parseInt(c.default_copies) || 1), 0);

            const standardOrder = ['S', 'A', 'B', 'C', 'R'];
            const distinctLevels = [...new Set(setCards.map(c => c.level || 'A'))];
            distinctLevels.sort((a, b) => {
                const ia = standardOrder.indexOf(a);
                const ib = standardOrder.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return String(a).localeCompare(String(b));
            });

            const levels = distinctLevels.map(lvl => {
                const lvlCards = setCards.filter(c => (c.level || 'A') === lvl);
                const copies = lvlCards.reduce((acc, c) => acc + (parseInt(c.default_copies) || 1), 0);
                const cardList = lvlCards.map(c => {
                    const cName = c[lang]?.name || c.es?.name || c.name || 'Carta';
                    const cStr = c.strength !== undefined ? c.strength : '?';
                    return `${cName} (${cStr}, ${c.default_copies || 1}x)`;
                }).join(', ');

                return {
                    level: lvl,
                    unique_cards: lvlCards.length,
                    copies: copies,
                    cardsDetail: cardList
                };
            });

            factions.push({
                id: setId,
                name: setName,
                baseSet: '',
                desc: '',
                color,
                iconUrl,
                totalCards: setCards.length,
                totalCopies: setCopies,
                levels
            });
        });
    }

    return {
        mT,
        title,
        subtitle,
        author,
        version,
        collectionName,
        totalCards,
        totalCopies,
        activeFactionsCount,
        descText,
        loreText,
        balanceText,
        factions
    };
}

// Helper to render one faction card HTML
/**
 * Renderiza la tarjeta de referencia en cuadrícula de una facción para la hoja de resumen A4.
 * 
 * @param {Object} f - Datos de la facción y su lista de cartas.
 * @param {Object} data - Datos globales del mazo y traducciones.
 * @returns {string} Fragmento HTML de la tarjeta de facción.
 */
function renderFactionCardHTML(f, data) {
    const rowsHTML = (f.levels || []).map(l => {
        const isTrainerLvl = String(l.level).includes('Train') || String(l.level).includes('Entraîn');
        const lvlLabel = isTrainerLvl ? '∞' : l.level;
        const badgeClass = isTrainerLvl ? 'lvl-trainer' : `lvl-${l.level}`;
        const distText = `<strong>${l.unique_cards || 0}</strong> ${data.mT.unique} (${l.copies || 0} ${data.mT.copies})`;
        return `
          <tr>
            <td class="col-lvl"><span class="summary-sheet-lvl-pill ${badgeClass}">${lvlLabel}</span></td>
            <td class="col-dist">${distText}</td>
            <td class="col-cards">${l.cardsDetail || '-'}</td>
          </tr>
        `;
    }).join('');

    return `
      <div class="summary-sheet-faction-card" style="border-left-color: ${f.color || '#0284c7'};">
        <div class="summary-sheet-faction-header">
          <div class="summary-sheet-faction-left">
            ${f.iconUrl ? `
              <div class="summary-sheet-fac-icon" style="background: ${f.color || '#0284c7'};">
                <img src="${f.iconUrl}" alt="">
              </div>
            ` : `
              <div class="summary-sheet-fac-icon" style="background: ${f.color || '#0284c7'};"></div>
            `}
            <div class="summary-sheet-fac-info">
              <span class="summary-sheet-fac-name">${f.name}</span>
              ${f.baseSet ? `<span class="summary-sheet-fac-base">${data.mT.basedOn}: ${f.baseSet}</span>` : ''}
            </div>
          </div>
          <div class="summary-sheet-fac-right">
            <span class="summary-sheet-fac-counts">${f.totalCards} ${data.mT.cards} · ${f.totalCopies} ${data.mT.copies}</span>
          </div>
        </div>

        <div class="summary-sheet-faction-table-wrap">
          <table class="summary-sheet-cards-table">
            <thead>
              <tr>
                <th class="col-lvl">${data.mT.level}</th>
                <th class="col-dist">${data.mT.distribution}</th>
                <th class="col-cards">${data.mT.cardsCol}</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;
}

// Generate HTML pages array for printable A4 Summary Sheets (multi-page support if many factions)
/**
 * Genera el array de páginas HTML de la portada y resumen oficial del mazo en formato A4.
 * - Página 1: Cabecera con logotipo de proyecto, estadísticas globales, descripción y hasta 6 facciones.
 * - Páginas de continuación (Página 2+): Desglose holgado de facciones restantes sin cabeceras duplicadas.
 * 
 * @param {Object} data - Datos compilados por getDeckSummaryData.
 * @param {string} lang - Código de idioma.
 * @returns {Array<string>} Array con el HTML de cada hoja A4 de resumen.
 */
function createDeckSummarySheetsHTML(data, lang) {
    const logoSrc = 'images/deck_logo.png';
    const totalFactions = data.factions.length;

    // Up to 6 factions fit on Page 1 comfortably alongside deck metadata & description.
    // If more than 6 factions, page 1 gets first 6 factions, and page 2 (and beyond) gets up to 8 factions each.
    const pageChunks = [];
    if (totalFactions <= 6) {
        pageChunks.push(data.factions);
    } else {
        pageChunks.push(data.factions.slice(0, 6));
        for (let i = 6; i < totalFactions; i += 8) {
            pageChunks.push(data.factions.slice(i, i + 8));
        }
    }

    const totalPages = pageChunks.length;

    return pageChunks.map((chunkFactions, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const factionCardsHTML = chunkFactions.map(f => renderFactionCardHTML(f, data)).join('');
        const pageNum = pageIndex + 1;

        if (isFirstPage) {
            const pageSecTitle = totalPages > 1
                ? `${data.mT.factionBreakdown} (1 - ${chunkFactions.length} de ${totalFactions})`
                : `${data.mT.factionBreakdown} (${totalFactions})`;
            const footerPageText = totalPages > 1
                ? `Challengers! Card Maker · Hoja 1 de ${totalPages}`
                : 'Challengers! Card Maker · Material comunitario no oficial';

            return `
            <div class="summary-sheet-top-header">
              <div class="summary-sheet-brand">
                <img src="${logoSrc}" alt="Logo" class="summary-sheet-logo">
                <div class="summary-sheet-brand-text">
                  <h1 class="summary-sheet-brand-title">Challengers! Card Maker</h1>
                  <span class="summary-sheet-brand-sub">${data.mT.summarySheetSub || 'Ficha Oficial de Expansión'}</span>
                </div>
              </div>
            </div>

            <div class="summary-sheet-deck-header">
              <h2 class="summary-sheet-deck-title">${data.title}</h2>
              <p class="summary-sheet-deck-sub">${data.subtitle}</p>
              <div class="summary-sheet-stats-grid">
                <div class="summary-sheet-stat-box">
                  <span class="summary-sheet-stat-label">${data.mT.editionCol}</span>
                  <strong class="summary-sheet-stat-val">${data.collectionName}</strong>
                </div>
                <div class="summary-sheet-stat-box">
                  <span class="summary-sheet-stat-label">${data.mT.authorCreator}</span>
                  <strong class="summary-sheet-stat-val">${data.author}</strong>
                </div>
                <div class="summary-sheet-stat-box">
                  <span class="summary-sheet-stat-label">${data.mT.version}</span>
                  <strong class="summary-sheet-stat-val">v${data.version}</strong>
                </div>
                <div class="summary-sheet-stat-box">
                  <span class="summary-sheet-stat-label">${data.mT.totalVolume}</span>
                  <strong class="summary-sheet-stat-val">${data.activeFactionsCount} ${data.mT.factions} · ${data.totalCards} ${data.mT.cards} (${data.totalCopies} ${data.mT.copies})</strong>
                </div>
              </div>
            </div>

            ${data.descText ? `
              <div class="summary-sheet-desc-box">
                <strong>${data.mT.description}:</strong> ${data.descText}
                ${data.balanceText ? `<div style="margin-top: 4px;"><strong>${data.mT.balanceRules}:</strong> ${data.balanceText}</div>` : ''}
              </div>
            ` : ''}

            <div class="summary-sheet-factions-section">
              <div class="summary-sheet-sec-header">
                <span class="summary-sheet-sec-title">${pageSecTitle}</span>
                <span class="summary-sheet-sec-hint">Composición y desglose detallado de cartas</span>
              </div>
              <div class="summary-sheet-factions-grid">
                ${factionCardsHTML}
              </div>
            </div>

            <div class="summary-sheet-footer">
              <span>Formato Oficial A4 · 63.5 × 88 mm · 9 cartas por hoja</span>
              <span>${footerPageText}</span>
            </div>
            `;
        } else {
            // Continuation page (Page 2+) - Clean layout without top brand/continuation headers
            const startIdx = 6 + (pageIndex - 1) * 8 + 1;
            const endIdx = Math.min(totalFactions, startIdx + chunkFactions.length - 1);
            const pageSecTitle = `${data.mT.factionBreakdown} (${startIdx} - ${endIdx} de ${totalFactions})`;

            return `
            <div class="summary-sheet-factions-section">
              <div class="summary-sheet-sec-header">
                <span class="summary-sheet-sec-title">${pageSecTitle}</span>
                <span class="summary-sheet-sec-hint">Composición y desglose detallado de cartas</span>
              </div>
              <div class="summary-sheet-factions-grid">
                ${factionCardsHTML}
              </div>
            </div>

            <div class="summary-sheet-footer">
              <span>Formato Oficial A4 · 63.5 × 88 mm · 9 cartas por hoja</span>
              <span>Challengers! Card Maker · Hoja ${pageNum} de ${totalPages}</span>
            </div>
            `;
        }
    });
}

// Single-page fallback for backwards compatibility
function createDeckSummarySheetHTML(data, lang) {
    const list = createDeckSummarySheetsHTML(data, lang);
    return list[0] || '';
}

// Render all A4 summary sheets to canvases via html2canvas (multi-page support)
async function renderDeckSummaryToCanvases(lang = currentLang) {
    const data = getDeckSummaryData(lang);
    const pagesHTML = createDeckSummarySheetsHTML(data, lang);
    const canvases = [];

    for (let i = 0; i < pagesHTML.length; i++) {
        const temp = document.createElement('div');
        temp.className = 'print-render-temp summary-sheet-render-temp';
        temp.style.cssText = `
        position: fixed;
        top: 0;
        left: -9999px;
        width: 794px;
        height: 1123px;
        background: #ffffff;
        box-sizing: border-box;
        z-index: -99999;
        opacity: 1;
        pointer-events: none;
        overflow: hidden;
      `;
        temp.innerHTML = `
        <div class="deck-summary-sheet">
          ${pagesHTML[i]}
        </div>
      `;
        document.body.appendChild(temp);

        // Wait for all images inside to load and decode properly
        const imgs = Array.from(temp.querySelectorAll('img'));
        await Promise.all(imgs.map(async img => {
            img.removeAttribute('loading');
            if (img.decode) {
                try {
                    await img.decode();
                } catch (e) {
                    if (!img.complete) {
                        await new Promise(res => {
                            img.onload = res;
                            img.onerror = res;
                            setTimeout(res, 500);
                        });
                    }
                }
            } else if (!img.complete) {
                await new Promise(res => {
                    img.onload = res;
                    img.onerror = res;
                    setTimeout(res, 500);
                });
            }
        }));

        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (e) { }
        }
        await new Promise(r => setTimeout(r, 60));

        const canvas = await html2canvas(temp.querySelector('.deck-summary-sheet'), {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123
        });

        canvases.push(canvas);
        document.body.removeChild(temp);
    }

    return canvases;
}

// Single canvas fallback
async function renderDeckSummaryToCanvas(lang = currentLang) {
    const list = await renderDeckSummaryToCanvases(lang);
    return list[0] || null;
}

// Open Deck Info Modal with Structured Data, Lore, Author & Balanced Breakdown
/**
 * Abre el modal informativo del mazo activo presentando estadísticas, autoría y reglas de balance.
 */
function openDeckInfoModal() {
    const modal = document.getElementById('deckInfoModal');
    const body = document.getElementById('deckInfoModalBody');
    const titleEl = document.getElementById('deckInfoTitle');
    const subtitleEl = document.getElementById('deckInfoSubtitle');
    if (!modal || !body) return;

    const lang = currentLang;
    const info = currentDeckRaw?.info || null;

    const modalI18n = {
        es: {
            defaultTitle: 'Información del Mazo',
            defaultSubtitle: 'Detalles, trasfondo y desglose de contenido',
            editionCol: 'Edición / Colección',
            authorCreator: 'Autor / Creador',
            version: 'Versión',
            totalVolume: 'Volumen total',
            factions: 'facciones',
            cards: 'cartas',
            copies: 'copias',
            description: 'Descripción',
            loreUniverse: 'Trasfondo Temático',
            balanceRules: 'Equilibrio y Reglas de Juego',
            factionBreakdown: 'Desglose de Facciones',
            basedOn: 'Basado en',
            level: 'Nivel',
            distribution: 'Distribución',
            cardsCol: 'Cartas',
            unique: 'únicas'
        },
        fr: {
            defaultTitle: 'Informations du Deck',
            defaultSubtitle: 'Détails, lore et composition',
            editionCol: 'Édition / Collection',
            authorCreator: 'Auteur / Créateur',
            version: 'Version',
            totalVolume: 'Volume total',
            factions: 'factions',
            cards: 'cartes',
            copies: 'copies',
            description: 'Description',
            loreUniverse: 'Contexte et Univers',
            balanceRules: 'Équilibre et Règles',
            factionBreakdown: 'Détail des Factions',
            basedOn: 'Basé sur',
            level: 'Niveau',
            distribution: 'Distribution',
            cardsCol: 'Cartes',
            unique: 'uniques'
        },
        en: {
            defaultTitle: 'Deck Information',
            defaultSubtitle: 'Details, lore and composition',
            editionCol: 'Edition / Collection',
            authorCreator: 'Author / Creator',
            version: 'Version',
            totalVolume: 'Total volume',
            factions: 'factions',
            cards: 'cards',
            copies: 'copies',
            description: 'Description',
            loreUniverse: 'Lore and Universe',
            balanceRules: 'Game Balance and Rules',
            factionBreakdown: 'Faction Breakdown',
            basedOn: 'Based on',
            level: 'Level',
            distribution: 'Breakdown',
            cardsCol: 'Cards',
            unique: 'unique'
        },
        de: {
            defaultTitle: 'Deck-Informationen',
            defaultSubtitle: 'Details, Hintergrund und Inhaltsübersicht',
            editionCol: 'Edition / Sammlung',
            authorCreator: 'Autor / Ersteller',
            version: 'Version',
            totalVolume: 'Gesamtumfang',
            factions: 'Fraktionen',
            cards: 'Karten',
            copies: 'Exemplare',
            description: 'Beschreibung',
            loreUniverse: 'Hintergrund & Universum',
            balanceRules: 'Spielbalance und Regeln',
            factionBreakdown: 'Fraktionsübersicht',
            basedOn: 'Basiert auf',
            level: 'Stufe',
            distribution: 'Verteilung',
            cardsCol: 'Karten',
            unique: 'einzigartige'
        },
        nl: {
            defaultTitle: 'Deck-informatie',
            defaultSubtitle: 'Details, achtergrond en inhoudsoverzicht',
            editionCol: 'Editie / Collectie',
            authorCreator: 'Auteur / Maker',
            version: 'Versie',
            totalVolume: 'Totale omvang',
            factions: 'facties',
            cards: 'kaarten',
            copies: 'exemplaren',
            description: 'Beschrijving',
            loreUniverse: 'Achtergrond & Universum',
            balanceRules: 'Spelbalans en Regels',
            factionBreakdown: 'Factie-overzicht',
            basedOn: 'Gebaseerd op',
            level: 'Niveau',
            distribution: 'Verdeling',
            cardsCol: 'Kaarten',
            unique: 'unieke'
        },
        it: {
            defaultTitle: 'Informazioni sul Mazzo',
            defaultSubtitle: 'Dettagli, ambientazione e composizione dei contenuti',
            editionCol: 'Edizione / Collezione',
            authorCreator: 'Autore / Creatore',
            version: 'Versione',
            totalVolume: 'Volume totale',
            factions: 'fazioni',
            cards: 'carte',
            copies: 'copie',
            description: 'Descrizione',
            loreUniverse: 'Ambientazione e Universo',
            balanceRules: 'Bilanciamento e Regole di Gioco',
            factionBreakdown: 'Dettaglio delle Fazioni',
            basedOn: 'Basato su',
            level: 'Livello',
            distribution: 'Distribuzione',
            cardsCol: 'Carte',
            unique: 'uniche'
        }
    };

    const mT = modalI18n[lang] || modalI18n.es;

    // Header titles
    const titleObj = info?.title || currentDeckRaw?.title;
    let modalTitle = mT.defaultTitle;
    if (titleObj && typeof titleObj === 'object') {
        modalTitle = titleObj[lang] || titleObj.es || titleObj.en || mT.defaultTitle;
    } else if (typeof titleObj === 'string' && titleObj.trim()) {
        modalTitle = titleObj;
    }

    const subObj = info?.subtitle || currentPackCollection;
    let modalSubtitle = mT.defaultSubtitle;
    if (subObj && typeof subObj === 'object') {
        modalSubtitle = subObj[lang] || subObj.es || subObj.en || mT.defaultSubtitle;
    } else if (typeof subObj === 'string' && subObj.trim()) {
        modalSubtitle = subObj;
    }

    if (titleEl) titleEl.textContent = modalTitle;
    if (subtitleEl) subtitleEl.textContent = modalSubtitle;

    let html = '';

    // 1. Meta Grid (Ficha técnica)
    const catalogDeck = DECK_CATALOG.find(d => {
        const rawTitleStr = typeof currentDeckRaw?.title === 'object' ? Object.values(currentDeckRaw.title).join(' ') : (currentDeckRaw?.title || '');
        return (d.pattern && (rawTitleStr.toLowerCase().includes(d.pattern) || (currentPackCollection || '').toLowerCase().includes(d.pattern)));
    });
    let author = info?.author || currentDeckRaw?.author || currentDeckRaw?.creator || catalogDeck?.author || '';
    if (author && typeof author === 'object') {
        author = author[lang] || author.es || author.en || '';
    }
    if (!author) {
        const defaultAuthors = {
            es: 'Comunidad Challengers!',
            en: 'Challengers! Community',
            fr: 'Communauté Challengers!',
            de: 'Challengers! Community',
            nl: 'Challengers! Community',
            it: 'Community Challengers!'
        };
        author = defaultAuthors[lang] || 'Comunidad Challengers!';
    }

    const version = info?.version || currentDeckRaw?.version || '1.0';

    const collObj = currentPackCollection || currentDeckRaw?.collection || currentDeckRaw?.collection_name;
    let collectionName = '';
    if (collObj && typeof collObj === 'object') {
        collectionName = collObj[lang] || collObj.es || collObj.en || '';
    } else if (typeof collObj === 'string' && collObj.trim()) {
        collectionName = collObj;
    }
    if (!collectionName || collectionName === 'Personalizada') {
        const defaultCollections = {
            es: 'Personalizada',
            en: 'Custom',
            fr: 'Personnalisée',
            de: 'Benutzerdefiniert',
            nl: 'Aangepast',
            it: 'Personalizzata'
        };
        collectionName = defaultCollections[lang] || 'Personalizada';
    }

    const totalCards = cardsData.length;
    const totalCopies = cardsData.reduce((acc, c) => acc + (parseInt(c.default_copies) || 1), 0);
    const activeFactionsCount = Object.keys(setsData).length || new Set(cardsData.map(c => c.set_id)).size;

    html += `
    <div class="deck-info-meta-grid">
      <div class="deck-info-meta-item">
        <span class="deck-info-meta-label">${mT.editionCol}</span>
        <span class="deck-info-meta-value">${collectionName}</span>
      </div>
      <div class="deck-info-meta-item">
        <span class="deck-info-meta-label">${mT.authorCreator}</span>
        <span class="deck-info-meta-value">${author}</span>
      </div>
      <div class="deck-info-meta-item">
        <span class="deck-info-meta-label">${mT.version}</span>
        <span class="deck-info-meta-value">${version}</span>
      </div>
      <div class="deck-info-meta-item">
        <span class="deck-info-meta-label">${mT.totalVolume}</span>
        <span class="deck-info-meta-value">${activeFactionsCount} ${mT.factions} · ${totalCards} ${mT.cards} (${totalCopies} ${mT.copies})</span>
      </div>
    </div>
  `;

    // 2. Descripción & Lore
    const descObj = info?.description || currentDeckRaw?.description;
    let descText = '';
    if (descObj && typeof descObj === 'object') {
        descText = descObj[lang] || descObj.es || descObj.en || '';
    } else if (typeof descObj === 'string') {
        descText = descObj;
    }

    if (descText) {
        html += `
      <div class="deck-info-section">
        <h4 class="deck-info-section-title">${mT.description}</h4>
        <p class="deck-info-paragraph">${descText}</p>
      </div>
    `;
    }

    const loreText = info?.lore?.[lang] || info?.lore?.es || '';
    if (loreText) {
        html += `
      <div class="deck-info-section">
        <h4 class="deck-info-section-title">${mT.loreUniverse}</h4>
        <p class="deck-info-paragraph">${loreText}</p>
      </div>
    `;
    }

    // 3. Principios de Balance
    const balanceText = info?.balance_notes?.[lang] || info?.balance_notes?.es || '';
    if (balanceText) {
        html += `
      <div class="deck-info-section">
        <h4 class="deck-info-section-title">${mT.balanceRules}</h4>
        <p class="deck-info-paragraph">${balanceText}</p>
      </div>
    `;
    }

    // 4. Desglose de Facciones
    html += `
    <div class="deck-info-section">
      <h4 class="deck-info-section-title">${mT.factionBreakdown}</h4>
      <div class="deck-info-factions-list">
  `;

    if (info?.factions && Array.isArray(info.factions)) {
        info.factions.forEach(fac => {
            const facName = fac.name?.[lang] || fac.name?.es || fac.set_id;
            const baseSet = fac.official_base?.[lang] || fac.official_base?.es || '';
            const facDesc = fac.description?.[lang] || fac.description?.es || '';
            const color = fac.color_hex || '#0284c7';
            const iconUrl = fac.icon_path ? getFactionIconPath(fac.icon_path) : '';

            html += `
        <div class="deck-info-faction-card">
          <div class="deck-info-faction-header" style="border-left: 4px solid ${color};">
            <div class="deck-info-faction-left">
              ${iconUrl ? `
                <div class="deck-info-faction-icon-box" style="background: ${color};">
                  <img src="${iconUrl}" alt="" class="deck-info-faction-icon-img">
                </div>
              ` : ''}
              <div class="deck-info-faction-titles">
                <h5 class="deck-info-faction-name">${facName}</h5>
                ${baseSet ? `<span class="deck-info-faction-base">${mT.basedOn}: ${baseSet}</span>` : ''}
              </div>
            </div>
            <span class="deck-info-faction-badge">${fac.total_cards} ${mT.cards} · ${fac.total_copies} ${mT.copies}</span>
          </div>
          <div class="deck-info-faction-body">
            ${facDesc ? `<p class="deck-info-faction-desc">${facDesc}</p>` : ''}
            <table class="deck-info-levels-table">
              <thead>
                <tr>
                  <th style="width: 50px;">${mT.level}</th>
                  <th style="width: 140px;">${mT.distribution}</th>
                  <th>${mT.cardsCol}</th>
                </tr>
              </thead>
              <tbody>
                ${fac.levels.map(lvl => `
                  <tr>
                    <td><span class="deck-info-lvl-badge deck-info-lvl-${lvl.level}">${lvl.level}</span></td>
                    <td><strong>${lvl.unique_cards}</strong> ${mT.unique} (${lvl.copies} ${mT.copies})</td>
                    <td class="deck-info-lvl-cards">${lvl.detail}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
        });
    } else {
        // Si no tiene el bloque info explícito, generamos dinámicamente el desglose a partir de setsData y cardsData
        const setIds = [...new Set(cardsData.map(c => c.set_id).filter(Boolean))];
        setIds.forEach(setId => {
            const setCards = cardsData.filter(c => c.set_id === setId);
            if (setCards.length === 0) return;
            const setInfo = setsData[setId] || {};
            const setName = setInfo.name?.[lang] || setInfo.name?.es || setId;
            const color = setInfo.color_hex || '#0284c7';
            const iconUrl = setInfo.icon_path ? getFactionIconPath(setInfo.icon_path) : '';
            const setCopies = setCards.reduce((acc, c) => acc + (parseInt(c.default_copies) || 1), 0);

            // Collect all distinct levels present in setCards dynamically
            const standardOrder = ['S', 'A', 'B', 'C', 'R'];
            const distinctLevels = [...new Set(setCards.map(c => c.level || 'A'))];
            distinctLevels.sort((a, b) => {
                const ia = standardOrder.indexOf(a);
                const ib = standardOrder.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return String(a).localeCompare(String(b));
            });

            html += `
        <div class="deck-info-faction-card">
          <div class="deck-info-faction-header" style="border-left: 4px solid ${color};">
            <div class="deck-info-faction-left">
              ${iconUrl ? `
                <div class="deck-info-faction-icon-box" style="background: ${color};">
                  <img src="${iconUrl}" alt="" class="deck-info-faction-icon-img">
                </div>
              ` : ''}
              <div class="deck-info-faction-titles">
                <h5 class="deck-info-faction-name">${setName}</h5>
              </div>
            </div>
            <span class="deck-info-faction-badge">${setCards.length} ${mT.cards} · ${setCopies} ${mT.copies}</span>
          </div>
          <div class="deck-info-faction-body">
            <table class="deck-info-levels-table">
              <thead>
                <tr>
                  <th style="width: 50px;">${mT.level}</th>
                  <th style="width: 140px;">${mT.distribution}</th>
                  <th>${mT.cardsCol}</th>
                </tr>
              </thead>
              <tbody>
                ${distinctLevels.map(lvl => {
                const lvlCards = setCards.filter(c => c.level === lvl);
                const lvlCopies = lvlCards.reduce((acc, c) => acc + (parseInt(c.default_copies) || 1), 0);
                const cardList = lvlCards.map(c => {
                    const cName = c[lang]?.name || c.es?.name || c.name || 'Carta';
                    const cStr = c.strength || '?';
                    return `${cName} (${cStr}, ${c.default_copies || 1}x)`;
                }).join(', ');
                const isTrainerLvl = String(lvl).includes('Entraîn') || String(lvl).includes('Train');
                const badgeLabel = isTrainerLvl ? '∞' : lvl;
                const badgeClass = isTrainerLvl ? 'deck-info-lvl-trainer' : `deck-info-lvl-${lvl}`;
                return `
                    <tr>
                      <td><span class="deck-info-lvl-badge ${badgeClass}" title="${lvl}">${badgeLabel}</span></td>
                      <td><strong>${lvlCards.length}</strong> ${mT.unique} (${lvlCopies} ${mT.copies})</td>
                      <td class="deck-info-lvl-cards">${cardList}</td>
                    </tr>
                  `;
            }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
        });
    }

    html += `
      </div>
    </div>
  `;

    body.innerHTML = html;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

/**
 * Cierra el modal informativo del mazo activo.
 */
function closeDeckInfoModal() {
    const modal = document.getElementById('deckInfoModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

// Build Vertical Faction Bookmark Tabs (Marca-páginas a la izquierda)
// =============================================================================
// SECCIÓN 11: SISTEMA REACTIVO DE FILTROS Y MARCADORES DE FACCIÓN
// =============================================================================
/**
 * Construye la barra horizontal de marcadores de facción basándose en getActiveFactionTabs().
 */
function buildFactionBookmarks() {
    const rail = document.getElementById('factionBookmarksBar');
    if (!rail) return;
    rail.innerHTML = '';

    if (!cardsData || cardsData.length === 0) {
        return;
    }

    const activeTabs = getActiveFactionTabs();
    if (activeTabs.length === 0) return;

    // Ensure activeFactionTab is valid for current deck
    if (!activeTabs.some(t => t.id === activeFactionTab)) {
        activeFactionTab = activeTabs[0].id;
    }

    const t = i18n[currentLang] || i18n.es;
    const tabNames = t.factionTabNames || {};

    activeTabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `faction-bookmark-tab ${activeFactionTab === tab.id ? 'active' : ''}`;
        btn.dataset.tabId = tab.id;

        // Dynamic set info from loaded pack
        const setInfo = setsData[tab.id] || (tab.id === 'starter' ? setsData['city'] : null);
        const tabColor = setInfo?.color_hex || tab.color;
        btn.style.setProperty('--tab-bg', tabColor);

        const name = setInfo?.name?.[currentLang] || setInfo?.name?.es || tabNames[tab.nameKey] || tab.defaultName || tab.id;
        const cards = tab.filterFn ? cardsData.filter(tab.filterFn) : [];
        const count = cards.length;
        btn.title = `${name} (${count} cartas)`;
        btn.setAttribute('aria-label', `${name} (${count} cartas)`);

        const customIcon = setInfo?.icon_path;
        if (customIcon) {
            const img = document.createElement('img');
            img.className = 'faction-tab-icon-img';
            img.src = getFactionIconPath(customIcon);
            img.alt = name;
            btn.appendChild(img);
        } else if (tab.iconType === 'img' && tab.icon) {
            const img = document.createElement('img');
            img.className = 'faction-tab-icon-img';
            img.src = getFactionIconPath(tab.icon);
            img.alt = name;
            btn.appendChild(img);
        } else if (tab.svgIcon) {
            btn.innerHTML = tab.svgIcon;
        }

        btn.addEventListener('click', () => {
            if (activeFactionTab === tab.id) return;
            activeFactionTab = tab.id;
            if (tab.id === 'all' || tab.id === 'starter' || tab.id === 'robot') {
                selectedColor = 'all';
            } else {
                selectedColor = tab.id;
            }
            buildFactionBookmarks();
            buildFilterChips();
            renderCards();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const container = document.getElementById('factionCardsContainer');
            if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
        });

        rail.appendChild(btn);
    });
}

// Build Filter Chip Buttons
/**
 * Construye y actualiza los selectores y chips de filtrado en el panel lateral (Nivel, Fuerza, etc.).
 */
function buildFilterChips() {
    if (!cardsData || cardsData.length === 0) {
        const gc = document.getElementById('gameChipsContainer');
        const lc = document.getElementById('levelChipsContainer');
        const cc = document.getElementById('colorChipsContainer');
        const sc = document.getElementById('strengthChipsContainer');
        if (gc) gc.innerHTML = '';
        if (lc) lc.innerHTML = '';
        if (cc) cc.innerHTML = '';
        if (sc) sc.innerHTML = '';
        return;
    }

    const t = i18n[currentLang];

    // 1. Version chips (Versión) - Only show if there are multiple versions in the deck
    const gameContainer = document.getElementById('gameChipsContainer');
    const gameGroup = gameContainer?.closest('.sidebar-filter-group');
    if (gameContainer) {
        gameContainer.innerHTML = '';
        const isPokemonPack = currentPackCollection === 'Edición Pokémon' || cardsData.some(c => c.game === 'pokemon' || c.collection?.includes('Pokémon'));
        const hasC1 = cardsData.some(c => c.game === 'c1');
        const hasC2 = cardsData.some(c => c.game === 'c2');

        let dynamicGameCategories = [];
        if (isPokemonPack) {
            dynamicGameCategories = ['all', 'pokemon'];
        } else if (hasC1 && hasC2) {
            dynamicGameCategories = ['all', 'c1', 'c2'];
        } else if (hasC1) {
            dynamicGameCategories = ['all', 'c1'];
        } else if (hasC2) {
            dynamicGameCategories = ['all', 'c2'];
        }

        if (dynamicGameCategories.length <= 1) {
            if (gameGroup) gameGroup.style.display = 'none';
            selectedGame = 'all';
        } else {
            if (gameGroup) gameGroup.style.display = '';
            if (!dynamicGameCategories.includes(selectedGame)) {
                selectedGame = 'all';
            }
            dynamicGameCategories.forEach(g => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `chip-btn ${selectedGame === g ? 'active' : ''}`;
                btn.dataset.game = g;

                let count = cardsData.length;
                if (g === 'pokemon') count = cardsData.filter(c => c.game === 'pokemon' || c.collection?.includes('Pokémon') || isPokemonPack).length;
                if (g === 'c1') count = cardsData.filter(c => c.game === 'c1' || c.game === 'both' || c.game?.includes('1')).length;
                if (g === 'c2') count = cardsData.filter(c => c.game === 'c2' || c.game === 'both' || c.game?.includes('Beach Cup')).length;

                let baseLabel = t.games && t.games[g] ? t.games[g].replace(/\s*\(\d+\)/, '') : g;
                if (g === 'pokemon') baseLabel = 'Edición Pokémon';
                btn.innerHTML = `<span>${baseLabel}</span> <span class="chip-count-pill">${count}</span>`;

                btn.addEventListener('click', () => {
                    selectedGame = g;
                    buildFilterChips();
                    renderCards();
                });
                gameContainer.appendChild(btn);
            });
        }
    }

    // 2. Set chips (Set / Nivel) - Only render levels that actually have cards in cardsData
    const levelContainer = document.getElementById('levelChipsContainer');
    if (levelContainer) {
        levelContainer.innerHTML = '';

        // "Todos los Sets" button
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = `chip-btn faction-all-btn ${selectedLevel === 'all' ? 'active' : ''}`;
        allBtn.dataset.level = 'all';
        allBtn.innerHTML = `<span>${t.levelLabels['all'] || 'Todos los Sets'}</span> <span class="chip-count-pill">${cardsData.length}</span>`;
        allBtn.addEventListener('click', () => {
            selectedLevel = 'all';
            buildFilterChips();
            renderCards();
        });
        levelContainer.appendChild(allBtn);

        // Row with Nivel A / B / C (only for levels present in current cardsData)
        const activeAbc = ['A', 'B', 'C'].filter(lvl => cardsData.some(c => c.level === lvl));
        if (activeAbc.length > 0) {
            const rowAbc = document.createElement('div');
            rowAbc.className = 'level-row-abc';

            activeAbc.forEach(lvl => {
                const count = cardsData.filter(c => c.level === lvl).length;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `level-chip-abc ${selectedLevel === lvl ? 'active' : ''}`;
                btn.dataset.level = lvl;
                btn.innerHTML = `
          <span class="level-abc-title">${t.levelLabels[lvl] || `Nivel ${lvl}`}</span>
          <span class="chip-count-pill">${count}</span>
        `;
                btn.title = `${t.levelLabels[lvl] || `Nivel ${lvl}`}: ${count} cartas`;
                btn.addEventListener('click', () => {
                    selectedLevel = (selectedLevel === lvl) ? 'all' : lvl;
                    buildFilterChips();
                    renderCards();
                });
                rowAbc.appendChild(btn);
            });
            levelContainer.appendChild(rowAbc);
        }

        // "Mazo Inicial" button (only if level S / starter cards exist)
        const countS = cardsData.filter(c => (c.level === 'S' || c.is_starter_card) && (activeFactionTab === 'robot' ? c.set_id === 'robot' : c.set_id !== 'robot')).length;
        if (countS > 0) {
            const starterBtn = document.createElement('button');
            starterBtn.type = 'button';
            starterBtn.className = `chip-btn level-chip-starter ${selectedLevel === 'S' ? 'active' : ''}`;
            starterBtn.dataset.level = 'S';
            starterBtn.innerHTML = `
        <span class="level-starter-label">${t.levelLabels['S'] || 'Mazo Inicial'}</span>
        <span class="chip-count-pill">${countS}</span>
      `;
            starterBtn.title = `${t.levelLabels['S'] || 'Mazo Inicial'}: ${countS} cartas`;
            starterBtn.addEventListener('click', () => {
                selectedLevel = (selectedLevel === 'S') ? 'all' : 'S';
                buildFilterChips();
                renderCards();
            });
            levelContainer.appendChild(starterBtn);
        }

        // Secondary row for Entrenadores, Robot, Solo (only if cards exist in deck!)
        const countTrainers = cardsData.filter(c => String(c.level).toLowerCase().startsWith('entra')).length;
        const countR = cardsData.filter(c => c.level === 'R').length;
        const countSolo = cardsData.filter(c => c.level === 'SOLO').length;

        if (countTrainers > 0 || countR > 0 || countSolo > 0) {
            const rowSecondary = document.createElement('div');
            rowSecondary.className = 'level-row-secondary';

            if (countTrainers > 0) {
                const trainersBtn = document.createElement('button');
                trainersBtn.type = 'button';
                trainersBtn.className = `chip-btn ${selectedLevel === 'Entraîneur' ? 'active' : ''}`;
                trainersBtn.dataset.level = 'Entraîneur';
                trainersBtn.innerHTML = `
          <span>${t.levelLabels['Entraîneur'] || 'Entrenadores'}</span>
          <span class="chip-count-pill">${countTrainers}</span>
        `;
                trainersBtn.title = `${t.levelLabels['Entraîneur'] || 'Entrenadores'}: ${countTrainers} cartas`;
                trainersBtn.addEventListener('click', () => {
                    selectedLevel = (selectedLevel === 'Entraîneur') ? 'all' : 'Entraîneur';
                    buildFilterChips();
                    renderCards();
                });
                rowSecondary.appendChild(trainersBtn);
            }

            if (countR > 0) {
                const rBtn = document.createElement('button');
                rBtn.type = 'button';
                rBtn.className = `chip-btn ${selectedLevel === 'R' ? 'active' : ''}`;
                rBtn.dataset.level = 'R';
                rBtn.innerHTML = `
          <span>Robot</span>
          <span class="chip-count-pill">${countR}</span>
        `;
                rBtn.title = `Robot: ${countR} cartas`;
                rBtn.addEventListener('click', () => {
                    selectedLevel = (selectedLevel === 'R') ? 'all' : 'R';
                    buildFilterChips();
                    renderCards();
                });
                rowSecondary.appendChild(rBtn);
            }

            if (countSolo > 0) {
                const soloBtn = document.createElement('button');
                soloBtn.type = 'button';
                soloBtn.className = `chip-btn ${selectedLevel === 'SOLO' ? 'active' : ''}`;
                soloBtn.dataset.level = 'SOLO';
                soloBtn.innerHTML = `
          <span>Solo</span>
          <span class="chip-count-pill">${countSolo}</span>
        `;
                soloBtn.title = `Modo Solo: ${countSolo} cartas`;
                soloBtn.addEventListener('click', () => {
                    selectedLevel = (selectedLevel === 'SOLO') ? 'all' : 'SOLO';
                    buildFilterChips();
                    renderCards();
                });
                rowSecondary.appendChild(soloBtn);
            }

            levelContainer.appendChild(rowSecondary);
        }
    }

    // 3. Factions chips ("Facciones" - Generadas según el contenido del mazo)
    const colorContainer = document.getElementById('colorChipsContainer');
    if (colorContainer) {
        colorContainer.innerHTML = '';

        // "Todas las Facciones" button
        const allColorBtn = document.createElement('button');
        allColorBtn.type = 'button';
        allColorBtn.className = `chip-btn faction-all-btn ${selectedColor === 'all' ? 'active' : ''}`;
        allColorBtn.dataset.color = 'all';
        allColorBtn.innerHTML = `<span>✦ ${t.colors['all'] || 'Todas las Facciones'}</span> <span class="chip-count-pill">${cardsData.length}</span>`;
        allColorBtn.addEventListener('click', () => {
            selectedColor = 'all';
            activeFactionTab = 'all';
            buildFactionBookmarks();
            buildFilterChips();
            renderCards();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const container = document.getElementById('factionCardsContainer');
            if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
        });
        colorContainer.appendChild(allColorBtn);

        // Dynamic factions present in current deck (excluding 'all' and 'starter')
        const dynamicFactions = getActiveFactionTabs().filter(t => t.id !== 'all' && t.id !== 'starter');

        const factionGrid = document.createElement('div');
        factionGrid.className = 'faction-icons-grid';

        dynamicFactions.forEach(f => {
            const setInfo = setsData[f.id] || {};
            const baseName = setInfo.name?.[currentLang] || setInfo.name?.es || t.colors[f.id] || f.defaultName || f.id;
            const customIcon = setInfo.icon_path || f.icon;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `faction-icon-btn ${selectedColor === f.id ? 'active' : ''}`;
            btn.dataset.color = f.id;

            const setCards = f.filterFn ? cardsData.filter(f.filterFn) : cardsData.filter(card => card.set_id === f.id || (setsData[card.set_id] && setsData[card.set_id].color_key === f.id));
            const setCopies = setCards.reduce((sum, card) => sum + (card.default_copies || 1), 0);

            btn.title = `${baseName} (${setCards.length} cartas distintas, ${setCopies} copias)`;
            btn.setAttribute('aria-label', baseName);

            if (customIcon) {
                const iconImg = document.createElement('img');
                iconImg.className = 'faction-icon-img';
                iconImg.src = getFactionIconPath(customIcon);
                iconImg.alt = baseName;
                btn.appendChild(iconImg);
            } else if (f.iconType === 'svg' && f.svgIcon) {
                btn.innerHTML = f.svgIcon;
            } else if (f.id === 'trainers') {
                btn.innerHTML = `<svg viewBox="0 0 24 24" class="faction-icon-svg"><circle cx="12" cy="7" r="4"/><path d="M12 13c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5z"/></svg>`;
            } else if (f.id === 'robot') {
                btn.innerHTML = `<svg viewBox="0 0 24 24" class="faction-icon-svg"><rect x="5" y="4" width="14" height="14" rx="2"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;
            }

            btn.addEventListener('click', () => {
                selectedColor = (selectedColor === f.id) ? 'all' : f.id;
                activeFactionTab = (selectedColor === 'all') ? 'all' : f.id;
                buildFactionBookmarks();
                buildFilterChips();
                renderCards();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            factionGrid.appendChild(btn);
        });

        colorContainer.appendChild(factionGrid);
    }

    // 4. Strength chips - Dynamically generated from strengths present in deck
    const strengthContainer = document.getElementById('strengthChipsContainer');
    if (strengthContainer) {
        strengthContainer.innerHTML = '';

        // "Todas" button
        const allStrBtn = document.createElement('button');
        allStrBtn.type = 'button';
        allStrBtn.className = `chip-btn ${selectedStrength === 'all' ? 'active' : ''}`;
        allStrBtn.dataset.strength = 'all';
        allStrBtn.textContent = t.all || 'Todas';
        allStrBtn.addEventListener('click', () => {
            selectedStrength = 'all';
            buildFilterChips();
            renderCards();
        });
        strengthContainer.appendChild(allStrBtn);

        // Extract unique strengths actually present in cardsData
        const rawStrengths = [...new Set(cardsData.map(c => String(c.strength !== undefined && c.strength !== null ? c.strength : '').trim()).filter(Boolean))];
        const numStrengths = rawStrengths
            .filter(s => /^\d+$/.test(s))
            .map(Number)
            .sort((a, b) => a - b);

        const hasSpecial = rawStrengths.some(s => ['?', '∞', '⟲'].includes(s));
        const otherStrengths = rawStrengths.filter(s => !/^\d+$/.test(s) && !['?', '∞', '⟲'].includes(s));

        const activeStrengths = [...numStrengths.map(String), ...otherStrengths];
        if (hasSpecial) {
            activeStrengths.push('special');
        }

        if (!activeStrengths.includes(selectedStrength) && selectedStrength !== 'all') {
            selectedStrength = 'all';
        }

        activeStrengths.forEach(str => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `chip-btn ${selectedStrength === str ? 'active' : ''}`;
            btn.dataset.strength = str;

            let text = str;
            let count = 0;
            if (str === 'special') {
                text = (t.strengthSpecial || 'Especial') + ' (?, ∞, ⟲)';
                count = cardsData.filter(c => ['?', '∞', '⟲'].includes(String(c.strength).trim())).length;
            } else {
                count = cardsData.filter(c => String(c.strength).trim() === str).length;
            }

            btn.innerHTML = `<span>${text}</span> <span class="chip-count-pill">${count}</span>`;
            btn.addEventListener('click', () => {
                selectedStrength = (selectedStrength === str) ? 'all' : str;
                buildFilterChips();
                renderCards();
            });
            strengthContainer.appendChild(btn);
        });
    }
}

// Update active filters dot indicator on header toggle button
/**
 * Actualiza el indicador visual de filtros activos en el botón de hamburguesa.
 */
function updateActiveFiltersIndicator() {
    const dot = document.getElementById('activeFiltersDot');
    if (!dot) return;
    const hasActive = (
        selectedGame !== 'all' ||
        selectedColor !== 'all' ||
        selectedLevel !== 'all' ||
        selectedStrength !== 'all' ||
        (searchQuery && searchQuery.trim().length > 0)
    );
    dot.style.display = hasActive ? 'block' : 'none';
}

// Reset all active filters
/**
 * Restablece todos los filtros de búsqueda, facción, nivel y fuerza a sus valores predeterminados.
 */
function resetAllFilters() {
    selectedGame = 'all';
    selectedColor = 'all';
    selectedLevel = 'all';
    selectedStrength = 'all';
    searchQuery = '';
    activeFactionTab = 'all';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';

    if (!cardsData || cardsData.length === 0) {
        updateNavbarVisibility();
        return;
    }

    buildFactionBookmarks();
    buildFilterChips();
    renderCards();
    updateActiveFiltersIndicator();
    updateNavbarVisibility();
}

// Filter and Render Cards Grid
// =============================================================================
// SECCIÓN 12: MOTOR DE RENDERIZADO DOM Y MAQUETACIÓN VECTORIAL DE CARTAS
// =============================================================================
/**
 * MOTOR DE RENDERIZADO DE LA GALERÍA DE CARTAS
 * Filtra el array cardsData con base en los criterios activos y construye los elementos DOM de tarjeta.
 * Para los mazos iniciales, organiza las cartas por los 8 iconos de jugador de torneo.
 */
function renderCards() {
    updateActiveFiltersIndicator();
    const grid = document.getElementById('cardsGrid');
    const noResults = document.getElementById('noResultsMessage');

    // Guard when no cards are loaded yet
    if (!cardsData || cardsData.length === 0) {
        if (grid) grid.innerHTML = '';
        if (noResults) noResults.style.display = 'none';
        const visibleCountEl = document.getElementById('visibleCount');
        if (visibleCountEl) visibleCountEl.textContent = '0';
        const totalCountEl = document.getElementById('totalCount');
        if (totalCountEl) totalCountEl.textContent = '0';
        return;
    }

    // Active Faction Tab (Organización por facciones con marca-páginas)
    const currentTabs = getActiveFactionTabs();
    let currentTab = currentTabs.find(t => t.id === activeFactionTab);
    if (!currentTab && currentTabs.length > 0) {
        currentTab = currentTabs[0];
        activeFactionTab = currentTab.id;
    }

    // Filter Cards
    const filtered = cardsData.filter(card => {
        // 1. Faction bookmark tab filter
        if (currentTab && currentTab.filterFn) {
            if (!currentTab.filterFn(card)) return false;
        }

        // 2. Game filter
        if (selectedGame !== 'all') {
            if (selectedGame === 'pokemon') {
                const isPoke = card.game === 'pokemon' || card.collection?.includes('Pokémon') || currentPackCollection === 'Edición Pokémon';
                if (!isPoke) return false;
            } else if (selectedGame === 'c1') {
                if (card.game !== 'c1' && card.game !== 'both' && !card.game?.includes('1')) return false;
            } else if (selectedGame === 'c2') {
                if (card.game !== 'c2' && card.game !== 'both' && !card.game?.includes('Beach Cup')) return false;
            }
        }

        // 3. Level / Set filter
        if (selectedLevel !== 'all') {
            const cardLvl = String(card.level || '').trim();
            if (selectedLevel === 'A') {
                if (cardLvl !== 'A') return false;
            } else if (selectedLevel === 'B') {
                if (cardLvl !== 'B') return false;
            } else if (selectedLevel === 'C') {
                if (cardLvl !== 'C') return false;
            } else if (selectedLevel === 'S') {
                if (cardLvl !== 'S') return false;
                if (activeFactionTab !== 'robot' && card.set_id === 'robot') return false;
            } else if (selectedLevel === 'Entraîneur' || selectedLevel === 'trainers') {
                if (!cardLvl.toLowerCase().startsWith('entra')) return false;
            } else if (selectedLevel === 'R') {
                if (cardLvl !== 'R') return false;
            } else if (selectedLevel === 'SOLO') {
                if (cardLvl !== 'SOLO') return false;
            } else {
                if (cardLvl !== selectedLevel) return false;
            }
        }

        // 4. Strength filter
        if (selectedStrength !== 'all') {
            const s = String(card.strength).trim();
            if (selectedStrength === 'special') {
                if (!['?', '∞', '⟲'].includes(s)) return false;
            } else {
                if (s !== selectedStrength) return false;
            }
        }

        // 5. Search query
        if (searchQuery) {
            const langData = card[currentLang] || card['es'] || card['en'] || {};
            const name = (langData.name || '').toLowerCase();
            const text = (langData.text || '').toLowerCase();
            const enName = (card.en?.name || '').toLowerCase();
            const frName = (card.fr?.name || '').toLowerCase();
            const esName = (card.es?.name || '').toLowerCase();
            const enText = (card.en?.text || '').toLowerCase();
            const frText = (card.fr?.text || '').toLowerCase();
            const esText = (card.es?.text || '').toLowerCase();
            const setObj = setsData[card.set_id];
            const setNameEs = (setObj?.name?.es || '').toLowerCase();
            const setNameEn = (setObj?.name?.en || '').toLowerCase();
            const setNameFr = (setObj?.name?.fr || '').toLowerCase();
            const setNameDe = (setObj?.name?.de || '').toLowerCase();
            const setNameNl = (setObj?.name?.nl || '').toLowerCase();
            const setNameIt = (setObj?.name?.it || '').toLowerCase();

            if (!name.includes(searchQuery) &&
                !text.includes(searchQuery) &&
                !enName.includes(searchQuery) &&
                !frName.includes(searchQuery) &&
                !esName.includes(searchQuery) &&
                !enText.includes(searchQuery) &&
                !frText.includes(searchQuery) &&
                !esText.includes(searchQuery) &&
                !setNameEs.includes(searchQuery) &&
                !setNameEn.includes(searchQuery) &&
                !setNameFr.includes(searchQuery) &&
                !setNameDe.includes(searchQuery) &&
                !setNameNl.includes(searchQuery) &&
                !setNameIt.includes(searchQuery) &&
                String(card.id) !== searchQuery) {
                return false;
            }
        }

        return true;
    });

    // Update visible counts
    visibleCardIds = filtered.map(c => c.id);
    const totalVisibleCopies = filtered.reduce((sum, c) => sum + (c.default_copies || 1), 0);
    const totalAllCopies = cardsData.reduce((sum, c) => sum + (c.default_copies || 1), 0);

    // Render Faction Banner Header inside the Content Div
    renderFactionHeader(filtered.length, totalVisibleCopies);

    const visibleCountEl = document.getElementById('visibleCount');
    if (visibleCountEl) visibleCountEl.textContent = filtered.length;

    const totalCountEl = document.getElementById('totalCount');
    if (totalCountEl) totalCountEl.textContent = cardsData.length;

    const copiesEl = document.getElementById('visibleCopiesCount');
    if (copiesEl) {
        if (filtered.length === cardsData.length) {
            copiesEl.textContent = `🃏 ${totalAllCopies} cartas en total (con copias)`;
            copiesEl.title = `${cardsData.length} cartas distintas, ${totalAllCopies} cartas físicas en la caja contando todas las copias`;
        } else {
            copiesEl.textContent = `🃏 ${totalVisibleCopies} cartas en total (con copias) de ${totalAllCopies}`;
            copiesEl.title = `${filtered.length} cartas distintas visibles, que suman ${totalVisibleCopies} cartas físicas en total`;
        }
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        grid.classList.remove('is-starter-view');
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    // Check if we should render the Starter Decks specialized layout:
    // Active when on 'starter' faction tab, or when all visible cards are starter cards with player_id
    const isStarterFactionTab = activeFactionTab === 'starter';
    const hasPlayerStarters = isStarterFactionTab && filtered.some(c => c.player_id && !isRobotCard(c));

    if (hasPlayerStarters) {
        renderStarterDecksLayout(grid, filtered);
    } else {
        grid.classList.remove('is-starter-view');
        grid.innerHTML = '';
        filtered.forEach((card, index) => {
            grid.appendChild(createCardItemElement(card, index));
        });
    }
}

/**
 * Fabrica el nodo DOM contenedor de una carta (.card-item) con soporte para volteo 3D.
 * 
 * @param {Card} card - Objeto de datos de la carta.
 * @param {number} [index=0] - Posición en la lista visible (para navegación en modal).
 * @returns {HTMLElement} Elemento DOM listo para ser insertado en la cuadrícula.
 */
function createCardItemElement(card, index = 0) {
    const isFlipped = flippedCardIds.has(card.id);
    const copies = card.default_copies || 1;
    const setInfo = setsData[card.set_id] || {};
    const colorKey = setInfo.color_key || card.color_key || 'gris';

    const cardEl = document.createElement('div');
    cardEl.className = `card-item ${isFlipped ? 'is-flipped' : ''} copies-count-${copies}`;
    cardEl.dataset.id = card.id;
    cardEl.style.setProperty('--card-index', Math.min(index, 24));

    // Stacked physical card layers behind c-flipper (Simulates number of physical copies in deck)
    const layersBehindCount = copies <= 1 ? 0 : (copies === 2 ? 1 : (copies === 3 ? 2 : (copies >= 5 ? 4 : 3)));
    let stackedBehindHTML = '';
    if (layersBehindCount > 0) {
        const isRobot = isRobotCard(card);
        const robotClass = isRobot ? ' is-robot' : '';
        stackedBehindHTML = `
      <div class="c-card-layers-behind" aria-hidden="true">
        ${Array.from({ length: layersBehindCount }).map((_, i) => `
          <div class="c-stacked-card layer-${i + 1}${robotClass}"></div>
        `).join('')}
      </div>
    `;
    }

    // Multiplier badge on top of stack (when 2 or more copies)
    const stackBadgeHTML = copies > 1
        ? `<div class="c-stack-count-badge" title="${copies} copias en la baraja oficial">${copies}&times;</div>`
        : '';

    cardEl.innerHTML = `
    ${stackBadgeHTML}
    ${stackedBehindHTML}

    <!-- 3D Flipper -->
    <div class="c-flipper">
      <!-- Front Face: Card Template Model -->
      <div class="c-front">
        ${createCardTemplateHTML(card, currentLang)}
      </div>

      <!-- Back Face: Digital / Original Card -->
      <div class="c-back">
        ${createPhotoCardHTML(card, currentLang)}
      </div>
    </div>
  `;

    // Prevent native drag of images so mouse drag works smoothly
    cardEl.querySelectorAll('img').forEach(img => {
        img.setAttribute('draggable', 'false');
    });

    // Gesture handling: Drag horizontally (mouse or touch) to flip card, Click/tap to open detail modal
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isHorizontalDrag = false;
    let isPointerDown = false;

    cardEl.addEventListener('pointerdown', (e) => {
        isPointerDown = true;
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();
        isHorizontalDrag = false;
    });

    cardEl.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaX) > 20 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
            isHorizontalDrag = true;
        }
    });

    cardEl.addEventListener('pointerup', (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const duration = Date.now() - startTime;

        // If dragged horizontally at least 30px within 750ms: flip card
        if (Math.abs(deltaX) >= 30 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15 && duration < 750) {
            isHorizontalDrag = true;
            toggleCardFlip(card.id);
            cardEl._suppressClickUntil = Date.now() + 450;
        }
    });

    cardEl.addEventListener('pointercancel', () => {
        isPointerDown = false;
        isHorizontalDrag = false;
    });

    // Click/tap card to open detail modal (unless dragged to flip)
    cardEl.addEventListener('click', (e) => {
        if (cardEl._suppressClickUntil && Date.now() < cardEl._suppressClickUntil) {
            return;
        }
        if (isHorizontalDrag) {
            isHorizontalDrag = false;
            return;
        }
        openModal(card.id, e);
    });

    return cardEl;
}

// Specialized High-End Layout for Starter Decks (Grouped by Player & Separate Macrotournament Dogs)
/**
 * Renderiza la vista especializada de barajas de inicio agrupadas por jugador de torneo (1 al 8).
 * 
 * @param {HTMLElement} grid - Contenedor DOM de la cuadrícula.
 * @param {Array<Card>} filtered - Cartas filtradas de nivel inicial.
 */
function renderStarterDecksLayout(grid, filtered) {
    grid.classList.add('is-starter-view');
    grid.innerHTML = '';

    const macroDogs = [];
    const playerMap = new Map();
    const unassignedCards = [];

    filtered.forEach(card => {
        if (isMacroDogCard(card)) {
            macroDogs.push(card);
        } else if (card.player_id) {
            const p = Number(card.player_id);
            if (!playerMap.has(p)) playerMap.set(p, []);
            playerMap.get(p).push(card);
        } else {
            unassignedCards.push(card);
        }
    });

    // Sort cards inside each player: Novato (str 1) -> Atleta (str 2) -> Perro (str 3) -> Campeona (str 4)
    for (const [p, cards] of playerMap.entries()) {
        cards.sort((a, b) => {
            const sA = parseInt(a.strength) || 0;
            const sB = parseInt(b.strength) || 0;
            return sA - sB;
        });
    }

    // Sort macro dogs by player_id 1..8
    macroDogs.sort((a, b) => (Number(a.player_id) || 0) - (Number(b.player_id) || 0));

    const playerIds = [...playerMap.keys()].sort((a, b) => a - b);
    const totalStarterCopies = [...playerMap.values()].flat().reduce((sum, c) => sum + (c.default_copies || 1), 0);

    // If selectedStarterPlayer is set to a player not in playerIds, reset to 'all'
    if (selectedStarterPlayer !== 'all' && selectedStarterPlayer !== 'macro' && !playerIds.includes(Number(selectedStarterPlayer))) {
        selectedStarterPlayer = 'all';
    }

    const starterI18n = {
        es: {
            toolbarTitle: 'Mazos de Inicio por Jugador',
            toolbarDesc: 'Mazos iniciales individuales de torneo con los símbolos oficiales de cada jugador.',
            players: 'jugadores',
            cards: 'cartas',
            macroDogs: 'perros macrotorneo',
            allPlayers: 'Todos los Jugadores',
            macroTourney: 'Macrotorneo',
            dogs: 'Perros',
            playerPrefix: 'Jugador',
            mTitle: 'Cartas de Perro para Macrotorneos (16 Jugadores)',
            mTag: 'Expansión Macrotorneos',
            mDesc: 'Estas 8 cartas de Perro con los símbolos oficiales de los 8 jugadores son exclusivas para disputar macrotorneos de hasta 16 jugadores (combinando las cajas de Challengers! 1 y Beach Cup). Están claramente separadas ya que NO forman parte del mazo inicial estándar de 6 cartas de cada jugador.',
            macroVariants: 'variantes de torneo'
        },
        fr: {
            toolbarTitle: 'Decks de Départ par Joueur',
            toolbarDesc: 'Decks initiaux individuels de tournoi avec les symboles officiels de chaque joueur.',
            players: 'joueurs',
            cards: 'cartes',
            macroDogs: 'chiens macrotournoi',
            allPlayers: 'Tous les Joueurs',
            macroTourney: 'Macrotournoi',
            dogs: 'Chiens',
            playerPrefix: 'Joueur',
            mTitle: 'Cartes Chien pour Macrotournois (16 Joueurs)',
            mTag: 'Extension Macrotournois',
            mDesc: 'Ces 8 cartes Chien portant les symboles des 8 joueurs sont exclusives aux macrotournois jusqu\'à 16 joueurs (combinant les boîtes de Challengers! 1 et Beach Cup). Elles sont clairement séparées car elles NE font PAS partie du deck de départ standard de 6 cartes de chaque joueur.',
            macroVariants: 'variantes de tournoi'
        },
        en: {
            toolbarTitle: 'Starter Decks by Player',
            toolbarDesc: 'Individual tournament starter decks with official player symbols.',
            players: 'players',
            cards: 'cards',
            macroDogs: 'macro dogs',
            allPlayers: 'All Players',
            macroTourney: 'Macrotournament',
            dogs: 'Dogs',
            playerPrefix: 'Player',
            mTitle: 'Dog Cards for Macrotournaments (16 Players)',
            mTag: 'Macrotournament Expansion',
            mDesc: 'These 8 Dog cards with official player symbols are exclusive to macrotournaments up to 16 players (combining Challengers! 1 and Beach Cup boxes). They are clearly separated as they are NOT part of each player\'s standard 6-card starter deck.',
            macroVariants: 'tournament variants'
        },
        de: {
            toolbarTitle: 'Startdecks nach Spieler',
            toolbarDesc: 'Individuelle Turnier-Startdecks mit den offiziellen Spielersymbolen.',
            players: 'Spieler',
            cards: 'Karten',
            macroDogs: 'Makroturnier-Hunde',
            allPlayers: 'Alle Spieler',
            macroTourney: 'Makroturnier',
            dogs: 'Hunde',
            playerPrefix: 'Spieler',
            mTitle: 'Hundekarten für Makroturniere (16 Spieler)',
            mTag: 'Makroturnier-Erweiterung',
            mDesc: 'Diese 8 Hundekarten mit den offiziellen Spielersymbolen sind exklusiv für Großturniere mit bis zu 16 Spielern bestimmt (Kombination von Challengers! 1 und Beach Cup). Sie sind klar getrennt, da sie NICHT Teil des regulären 6-Karten-Startdecks der Spieler sind.',
            macroVariants: 'Turniervarianten'
        },
        nl: {
            toolbarTitle: 'Startdecks per Speler',
            toolbarDesc: 'Individuele toernooistartdecks met de officiële spelerssymbolen.',
            players: 'spelers',
            cards: 'kaarten',
            macroDogs: 'macrotoernooi honden',
            allPlayers: 'Alle Spelers',
            macroTourney: 'Macrotoernooi',
            dogs: 'Honden',
            playerPrefix: 'Speler',
            mTitle: 'Hondenkaarten voor Macrotoernooien (16 Spelers)',
            mTag: 'Macrotoernooi Uitbreiding',
            mDesc: 'Deze 8 hondenkaarten met de officiële spelerssymbolen zijn exclusief voor toernooien tot 16 spelers (waarbij Challengers! 1 en Beach Cup worden gecombineerd). Ze zijn duidelijk gescheiden omdat ze GEEN deel uitmaken van het standaard 6-kaarten startdeck van elke speler.',
            macroVariants: 'toernooivarianten'
        },
        it: {
            toolbarTitle: 'Mazzi Iniziali per Giocatore',
            toolbarDesc: 'Mazzi iniziali individuali da torneo con i simboli ufficiali di ciascun giocatore.',
            players: 'giocatori',
            cards: 'carte',
            macroDogs: 'cani macrotorneo',
            allPlayers: 'Tutti i Giocatori',
            macroTourney: 'Macrotorneo',
            dogs: 'Cani',
            playerPrefix: 'Giocatore',
            mTitle: 'Carte Cane per Macrotornei (16 Giocatori)',
            mTag: 'Espansione Macrotorneo',
            mDesc: 'Queste 8 carte Cane con i simboli ufficiali degli 8 giocatori sono esclusive per macrotornei fino a 16 giocatori (combinando le scatole di Challengers! 1 e Beach Cup). Sono chiaramente separate poiché NON fanno parte del mazzo iniziale standard da 6 carte di ciascun giocatore.',
            macroVariants: 'varianti da torneo'
        }
    };

    const sT = starterI18n[currentLang] || starterI18n.es;
    const toolbarTitle = sT.toolbarTitle;
    const toolbarDesc = sT.toolbarDesc;

    // Toolbar Element
    const toolbarEl = document.createElement('div');
    toolbarEl.className = 'starter-toolbar';
    toolbarEl.innerHTML = `
    <div class="starter-toolbar-header">
      <div class="starter-toolbar-title-wrap">
        <span class="starter-toolbar-badge">${toolbarTitle}</span>
        <span class="starter-toolbar-desc">${toolbarDesc}</span>
      </div>
      <div class="starter-toolbar-stats">
        <span class="starter-stats-pill">${playerIds.length} ${sT.players} · ${totalStarterCopies} ${sT.cards}</span>
        ${macroDogs.length > 0 ? `<span class="starter-stats-pill macro-pill">+${macroDogs.length} ${sT.macroDogs}</span>` : ''}
      </div>
    </div>
    <div class="starter-toolbar-chips" role="tablist">
      <button type="button" class="starter-chip ${selectedStarterPlayer === 'all' ? 'active' : ''}" data-player="all">
        <span class="starter-chip-icon">👥</span>
        <span>${sT.allPlayers} (${playerIds.length})</span>
      </button>
      ${playerIds.map(p => {
        const cfg = getPlayerConfig(p);
        const pName = cfg.name[currentLang] || cfg.name.es;
        const iconHTML = getPlayerIconHTML(cfg.code || p, pName);
        return `
          <button type="button" class="starter-chip ${selectedStarterPlayer === String(p) ? 'active' : ''}" data-player="${p}">
            <span class="starter-chip-symbol" style="color: ${cfg.color};">${iconHTML || cfg.symbol}</span>
            <span>J${p} ${pName}</span>
          </button>
        `;
    }).join('')}
      ${macroDogs.length > 0 ? `
        <button type="button" class="starter-chip starter-chip-macro ${selectedStarterPlayer === 'macro' ? 'active' : ''}" data-player="macro">
          <span class="starter-chip-symbol">🏆</span>
          <span>${sT.macroTourney} (${macroDogs.length} ${sT.dogs})</span>
        </button>
      ` : ''}
    </div>
  `;

    toolbarEl.querySelectorAll('.starter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedStarterPlayer = btn.dataset.player;
            renderCards();
        });
    });

    grid.appendChild(toolbarEl);

    let globalCardIndex = 0;

    // Render Player Sections
    if (selectedStarterPlayer === 'all' || playerIds.includes(Number(selectedStarterPlayer))) {
        playerIds.forEach(p => {
            if (selectedStarterPlayer !== 'all' && Number(selectedStarterPlayer) !== p) {
                return;
            }

            const pCards = playerMap.get(p);
            const cfg = getPlayerConfig(p);
            const pName = cfg.name[currentLang] || cfg.name.es;
            const pTotalCopies = pCards.reduce((s, c) => s + (c.default_copies || 1), 0);
            const iconHTML = getPlayerIconHTML(cfg.code || p, pTitleText(p, pName));

            // Calculate dynamic composition pills from actual cards in this player deck!
            const compMap = new Map();
            pCards.forEach(c => {
                const cName = c[currentLang]?.name || c.es?.name || c.name || 'Carta';
                const copies = c.default_copies || 1;
                compMap.set(cName, (compMap.get(cName) || 0) + copies);
            });
            const compPillsHTML = [...compMap.entries()].map(([cName, count], idx) => `
        <span class="starter-comp-pill ${idx === 0 && count > 1 ? 'pill-novato' : ''}">${cName} &times; ${count}</span>
      `).join('');

            function pTitleText(num, name) {
                return `${sT.playerPrefix} ${num} · ${name}`;
            }

            const sectionEl = document.createElement('section');
            sectionEl.className = 'starter-player-group';
            sectionEl.dataset.player = p;

            const pTitle = pTitleText(p, pName);
            const pMeta = (currentLang === 'fr')
                ? `Deck initial · ${pTotalCopies} cartes physiques (${pCards.length} modèles)`
                : (currentLang === 'en')
                    ? `Starter deck · ${pTotalCopies} physical cards (${pCards.length} models)`
                    : (currentLang === 'de')
                        ? `Startdeck · ${pTotalCopies} physische Karten (${pCards.length} Modelle)`
                        : (currentLang === 'nl')
                            ? `Startdeck · ${pTotalCopies} fysieke kaarten (${pCards.length} modellen)`
                            : (currentLang === 'it')
                                ? `Mazzo iniziale · ${pTotalCopies} carte fisiche (${pCards.length} modelli)`
                                : `Mazo inicial · ${pTotalCopies} cartas físicas (${pCards.length} modelos)`;

            sectionEl.innerHTML = `
        <div class="starter-player-header">
          <div class="starter-player-header-left">
            <span class="starter-player-avatar" style="color: ${cfg.color}; background: ${cfg.bg}; border-color: ${cfg.color};">
              ${iconHTML || cfg.symbol}
            </span>
            <div class="starter-player-titles">
              <h3 class="starter-player-heading">${pTitle}</h3>
              <span class="starter-player-subheading">${pMeta}</span>
            </div>
          </div>
          <div class="starter-player-comp-pills">
            ${compPillsHTML}
          </div>
        </div>
        <div class="starter-cards-row cards-grid"></div>
      `;

            const rowGrid = sectionEl.querySelector('.starter-cards-row');
            pCards.forEach(card => {
                rowGrid.appendChild(createCardItemElement(card, globalCardIndex++));
            });

            grid.appendChild(sectionEl);
        });
    }

    // Render Macrotournament Dogs Section (Strictly Separated!)
    if (macroDogs.length > 0 && (selectedStarterPlayer === 'all' || selectedStarterPlayer === 'macro')) {
        const macroSectionEl = document.createElement('section');
        macroSectionEl.className = 'starter-macro-group';
        macroSectionEl.dataset.section = 'macro';

        const mTitle = sT.mTitle;
        const mTag = sT.mTag;
        const mDesc = sT.mDesc;

        macroSectionEl.innerHTML = `
      <div class="starter-macro-header">
        <div class="starter-macro-header-left">
          <div class="starter-macro-trophy-box">🏆</div>
          <div class="starter-macro-info">
            <div class="starter-macro-badge-row">
              <span class="starter-macro-tag">${mTag}</span>
              <span class="starter-macro-count-pill">${macroDogs.length} ${sT.macroVariants}</span>
            </div>
            <h3 class="starter-macro-title">${mTitle}</h3>
            <p class="starter-macro-desc">${mDesc}</p>
          </div>
        </div>
      </div>
      <div class="starter-macro-cards-row cards-grid"></div>
    `;

        const macroGrid = macroSectionEl.querySelector('.starter-macro-cards-row');
        macroDogs.forEach(card => {
            macroGrid.appendChild(createCardItemElement(card, globalCardIndex++));
        });

        grid.appendChild(macroSectionEl);
    }

    // If any unassigned starter cards exist
    if (unassignedCards.length > 0 && selectedStarterPlayer === 'all') {
        const otherSectionEl = document.createElement('section');
        otherSectionEl.className = 'starter-player-group starter-other-group';
        otherSectionEl.innerHTML = `
      <div class="starter-player-header">
        <div class="starter-player-header-left">
          <span class="starter-player-avatar" style="color: #64748b; background: rgba(100,116,139,0.12);">★</span>
          <div class="starter-player-titles">
            <h3 class="starter-player-heading">Otras Cartas de Inicio</h3>
            <span class="starter-player-subheading">${unassignedCards.length} cartas</span>
          </div>
        </div>
      </div>
      <div class="starter-cards-row cards-grid"></div>
    `;
        const otherGrid = otherSectionEl.querySelector('.starter-cards-row');
        unassignedCards.forEach(card => {
            otherGrid.appendChild(createCardItemElement(card, globalCardIndex++));
        });
        grid.appendChild(otherSectionEl);
    }
}

/**
 * Procesa y formatea el texto de efecto o habilidad de una carta, reemplazando palabras clave por badges.
 * 
 * @param {string} text - Texto en bruto de la habilidad.
 * @param {string} lang - Código de idioma.
 * @param {Card|null} [card=null] - Referencia a la carta para validación contextual.
 * @returns {string} Fragmento HTML con estilos y badges inline.
 */
function renderEffectBoxHTML(text, lang, card = null) {
    let raw = (text || '').trim();

    // If raw is empty or placeholder, check if other language versions of the card contain a rarity text
    if ((!raw || raw === '""' || raw === '()') && card) {
        const fallbackText = card.en?.text || card.es?.text || card.fr?.text || '';
        if (fallbackText && /^(?:rare|rara|selten|zeldzaam|common|común|gewöhnlich|gewoon|infrecuente)\s*(?:(\d+)x|x(\d+)|\((\d+)\s*(?:copias?|copies|exemplare|exemplaren)\))?$/i.test(fallbackText.trim())) {
            raw = fallbackText.trim();
        }
    }

    // Check if raw is a pure rarity string: "Rare 3x", "Rare x3", "Rare 2x", "Infrecuente (3 copias)", "Selten 3x", "Zeldzaam 3x", "Rara 3x", etc.
    const rarityMatch = raw.match(/^(?:rare|rara|selten|zeldzaam|common|común|gewöhnlich|gewoon|infrecuente)\s*(?:(\d+)x|x(\d+)|\((\d+)\s*(?:copias?|copies|exemplare|exemplaren)\))?$/i);
    if (rarityMatch) {
        const copies = rarityMatch[1] || rarityMatch[2] || rarityMatch[3] || (card ? card.default_copies : null) || '3';
        const num = parseInt(copies) || 3;
        const isRare = num <= 4;

        let displayStr = '';
        if (lang === 'es') {
            displayStr = isRare ? `Infrecuente (${num} copias)` : `Común (${num} copias)`;
        } else if (lang === 'en') {
            displayStr = isRare ? `Rare ${num}x` : `Common ${num}x`;
        } else if (lang === 'fr') {
            displayStr = isRare ? `Rare ${num}x` : `Common ${num}x`;
        } else if (lang === 'de') {
            displayStr = isRare ? `Selten ${num}x` : `Gewöhnlich ${num}x`;
        } else if (lang === 'nl') {
            displayStr = isRare ? `Zeldzaam ${num}x` : `Gewoon ${num}x`;
        } else if (lang === 'it') {
            displayStr = isRare ? `Rara ${num}x` : `Comune ${num}x`;
        } else {
            displayStr = isRare ? `Rare ${num}x` : `Common ${num}x`;
        }
        return `<div class="c-rarity-text">${displayStr}</div>`;
    }

    if (!raw || raw.includes('Sans texte') || raw.includes('Sin texto') || raw.includes('No special') || raw === '""') {
        return '';
    }

    return formatEffectText(raw, lang);
}

// Generate Card Template HTML (Front Face - Authentic Game Layout)
/**
 * MOTOR DE MAQUETACIÓN VECTORIAL DE CARTA (PLANTILLA DINÁMICA)
 * 
 * Genera el marcado HTML y estilos inline de la carta completa a escala:
 * cabecera con fuerza y nivel, caja de arte con encuadre dinámico, caja de habilidad con tipografía ajustada
 * y pie con icono de facción y créditos.
 * 
 * @param {Card} card - Objeto de datos de la carta.
 * @param {string} lang - Idioma de renderizado.
 * @param {boolean} [isPrintMode=false] - True para modo impresión (esquinas rectas sin redondeo).
 * @param {boolean} [hasWhiteMargin=true] - Si debe incluir margen perimetral blanco de sangrado.
 * @param {string} [artFit='cover'] - Ajuste de la ilustración ('cover', 'contain', 'fit-height', 'fit-width').
 * @param {number} [artScale=100] - Factor de escala porcentual de la ilustración (75 a 125).
 * @param {number} [marginMm=4] - Grosor en milímetros del margen blanco.
 * @returns {string} Marcado HTML completo de la plantilla de la carta.
 */
function createCardTemplateHTML(card, lang, isPrintMode = false, hasWhiteMargin = true, artFit = 'cover', artScale = 100, marginMm = 4) {
    const cData = card[lang] || card['es'] || card['en'] || {};
    const str = card.strength || '?';
    const name = cData.name || '';
    const level = card.level || 'A';
    const setInfo = setsData[card.set_id] || {};
    const colorKey = setInfo.color_key || card.color_key || 'gris';
    const colorHex = setInfo.color_hex || card.color_hex;
    const customColorStyle = (colorHex && colorKey !== 'rainbow')
        ? `style="--card-color: ${colorHex};"`
        : '';
    const artPath = getArtImagePath(card.art_image || card.art_path);
    const collectionName = getCardCollectionName(card);

    // Display letter for level badge
    const isTrainer = String(level).includes('Entraîn') || String(level).includes('Train');
    let displayLevel = level;
    if (isTrainer) {
        displayLevel = '∞';
    }
    const isSolo = String(displayLevel).toUpperCase() === 'SOLO' || String(displayLevel).length > 2;
    const soloClass = isSolo ? ' is-solo is-long-level' : '';
    const levelTabHTML = isTrainer
        ? ''
        : `<div class="c-level-tab${soloClass}">${displayLevel}</div>`;
    const trainerRowClass = isTrainer ? ' is-trainer' : '';
    const printSquareClass = isPrintMode ? ' is-print-square' : '';
    const marginClass = hasWhiteMargin ? '' : ' no-white-margin';

    // Effect text
    const rawText = (cData.text || '').trim();
    const effectHTML = renderEffectBoxHTML(rawText, lang, card);

    // Character length class for responsive typography without scroll
    let lengthClass = 'text-short';
    const len = rawText.length;
    if (len > 160) {
        lengthClass = 'text-xlong';
    } else if (len > 105) {
        lengthClass = 'text-long';
    } else if (len > 55) {
        lengthClass = 'text-medium';
    }

    // Real Side Tabs with Extracted Official Faction Icon
    let sideTabsHTML = '';
    const isRobotCard = (card.set_id === 'robot' || card.level === 'R' || card.level === 'SOLO');
    const isStarter = (card.level === 'S' || card.is_starter_card) && !isRobotCard;
    let iconFile = card.icon_path || setInfo.icon_path;

    if (!iconFile) {
        if (isRobotCard) {
            iconFile = setsData['robot']?.icon_path || 'icon_robot.png';
        } else if (card.set_id === 'city' || isStarter) {
            iconFile = setsData['city']?.icon_path || 'icon_ville.png';
        }
    }

    const pIconKey = card.player_icon || (card.player_variants && card.player_variants[0]?.icon);

    if (iconFile) {
        const iconSrc = getFactionIconPath(iconFile);
        const typeName = setInfo.name?.[lang] || setInfo.name?.['es'] || cData.type || '';
        sideTabsHTML = `
      <div class="c-side-tab left" title="${typeName}">
        <img class="c-tab-icon" src="${iconSrc}" alt="${typeName}">
      </div>
      <div class="c-side-tab right" title="${typeName}">
        <img class="c-tab-icon" src="${iconSrc}" alt="${typeName}">
      </div>
    `;
    }

    // Starter player icon badge (Bottom-left corner, authentic to physical card layout)
    let starterPlayerHTML = '';
    if (isStarter && (pIconKey || card.player_id) && !isRobotCard) {
        const pTitle = isMacroDogCard(card)
            ? `Macrotorneo · Jugador ${card.player_id}`
            : (card.player_id ? `Jugador ${card.player_id}` : 'Mazo de Inicio');
        starterPlayerHTML = `
      <div class="c-starter-player-corner left" title="${pTitle}">
        <span class="c-starter-player-icon">${getPlayerIconHTML(pIconKey || card.player_id, pTitle)}</span>
      </div>
    `;
    }

    // Card Number and Collection metadata tag (Only on screen, omitted in print/PDF mode)
    let metaTagText = collectionName;
    if (isMacroDogCard(card)) {
        metaTagText = 'Macrotorneo (16J)';
    } else if (card.player_id && (card.level === 'S' || card.is_starter_card) && !isRobotCard) {
        metaTagText = `Mazo Inicial · J${card.player_id}`;
    }
    const idTagHTML = isPrintMode
        ? ''
        : `<div class="c-id-tag">#${String(card.id).padStart(2, '0')} &bull; ${metaTagText}</div>`;

    // Artwork fit class & scaling style
    const fitClass = normalizeArtFitClass(artFit);
    const scaleStyle = (artScale && Number(artScale) !== 100)
        ? `style="transform: scale(${Number(artScale) / 100}); transform-origin: center center;"`
        : '';
    // Avoid lazy loading during print/canvas generation to ensure all cards load reliably
    const loadingAttr = isPrintMode ? 'loading="eager"' : 'loading="lazy"';

    let cardStyle = customColorStyle;
    if (hasWhiteMargin && marginMm) {
        const padPx = Math.round(Number(marginMm) * (isPrintMode ? (300 / 63.5) : (170 / 63.5)));
        const colorPart = customColorStyle ? customColorStyle.slice(7, -1) + '; ' : '';
        cardStyle = `style="${colorPart}padding: ${padPx}px !important;"`;
    }

    return `
    <div class="c-card theme-${colorKey}${printSquareClass}${marginClass}" ${cardStyle}>
      <!-- Header: White center with Colored Corner Tabs -->
      <div class="c-card-header">
        <div class="c-strength-corner left">${str}</div>
        <div class="c-card-title" title="${name}">${name}</div>
        <div class="c-strength-corner right">${str}</div>
      </div>

      <!-- Center Art & Real Faction Tabs -->
      <div class="c-art-container">
        <img class="c-art-image ${fitClass}" ${scaleStyle} src="${artPath}" alt="${name}" ${loadingAttr}>
        ${sideTabsHTML}
      </div>

      <!-- Bottom Row: Text and Level Tab in ONE line -->
      <div class="c-bottom-row${trainerRowClass}">
        ${starterPlayerHTML}
        <div class="c-effect-area ${lengthClass}">
          <div class="c-text-content ${lengthClass}">
            ${effectHTML}
          </div>
        </div>
        ${idTagHTML}
        ${levelTabHTML}
      </div>
    </div>
  `;
}

// Generate Compact Card Strip / Sleeve Insert HTML (Table with Name on top, Effect text below)
/**
 * Genera el HTML de una tira compacta de inserción para fundas opacas (63.5 × 27.5 mm).
 * Diseñada para colocarse dentro de la funda sobre una carta genérica, ahorrando hasta un 70% de tinta.
 * 
 * @param {Card} card - Datos de la carta.
 * @param {string} lang - Idioma de la tira.
 * @param {boolean} [isPrintMode=false] - Modo de exportación / impresión.
 * @returns {string} Marcado HTML de la tira de inserción.
 */
function createCardStripHTML(card, lang, isPrintMode = false) {
    const cData = card[lang] || card['es'] || card['en'] || {};
    const str = card.strength || '?';
    const name = cData.name || '';
    const level = card.level || 'A';
    const setInfo = setsData[card.set_id] || {};
    const colorKey = setInfo.color_key || card.color_key || 'gris';
    const colorHex = setInfo.color_hex || card.color_hex;
    const customColorStyle = (colorHex && colorKey !== 'rainbow')
        ? `style="--card-color: ${colorHex}; border-left-color: ${colorHex};"`
        : '';

    const isTrainer = String(level).includes('Entraîn') || String(level).includes('Train');
    const displayLevel = isTrainer ? '∞' : level;

    // Effect text
    const rawText = (cData.text || '').trim();
    const effectHTML = renderEffectBoxHTML(rawText, lang, card);

    let lengthClass = 'text-short';
    const len = rawText.length;
    if (len > 160) {
        lengthClass = 'text-xlong';
    } else if (len > 105) {
        lengthClass = 'text-long';
    } else if (len > 55) {
        lengthClass = 'text-medium';
    }

    // Faction / set indicator icon
    let factionIconHTML = '';
    const iconFile = card.icon_path || setInfo.icon_path;
    if (iconFile) {
        const iconSrc = getFactionIconPath(iconFile);
        factionIconHTML = `<img class="strip-faction-icon" src="${iconSrc}" alt="" loading="lazy">`;
    }

    // Starter player icon badge
    let playerIconHTML = '';
    const pIconKey = card.player_icon || (card.player_variants && card.player_variants[0]?.icon);
    if (card.is_starter_card && pIconKey && PLAYER_ICONS_SVG[pIconKey]) {
        playerIconHTML = `<span class="strip-player-icon" title="Jugador ${card.player_id || ''}">${PLAYER_ICONS_SVG[pIconKey]}</span>`;
    }

    return `
    <div class="print-strip-card theme-${colorKey}" ${customColorStyle}>
      <table class="print-strip-table">
        <thead>
          <tr class="strip-header-row">
            <th class="strip-th-str" title="Fuerza: ${str}">
              <span class="strip-str-badge">${str}</span>
              ${playerIconHTML}
            </th>
            <th class="strip-th-name">
              ${factionIconHTML}
              <span class="strip-card-name" title="${name}">${name}</span>
            </th>
            <th class="strip-th-lvl" title="Nivel: ${displayLevel}">
              <span class="strip-lvl-badge">${displayLevel}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr class="strip-body-row">
            <td colspan="3" class="strip-td-effect ${lengthClass}">
              ${effectHTML || '<span class="strip-no-effect">—</span>'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// Generate BGA Digital Card HTML (Back Face - Clean, Unobscured Official Card)
/**
 * Genera el HTML de la carta en modo 'Digital Original' (alta definición sin plantilla vectorial).
 * 
 * @param {Card} card - Datos de la carta.
 * @param {string} lang - Idioma.
 * @param {boolean} [isPrintMode=false] - Si es para pliego de impresión.
 * @param {string} [artFit='contain'] - Modo de ajuste de arte.
 * @param {number} [artScale=100] - Escala de la imagen.
 * @returns {string} Marcado HTML de la tarjeta de foto.
 */
function createPhotoCardHTML(card, lang, isPrintMode = false, artFit = 'contain', artScale = 100) {
    const cData = card[lang] || card['es'] || card['en'] || {};
    const displayImg = getCardImagePath(card.card_image || card.digital_card_path || card.card_path);
    const loadingAttr = isPrintMode ? 'loading="eager"' : 'loading="lazy"';
    const fitClass = normalizeArtFitClass(artFit);
    const scaleStyle = (artScale && Number(artScale) !== 100)
        ? `style="transform: scale(${Number(artScale) / 100}); transform-origin: center center;"`
        : '';

    return `
    <div class="c-photo-card${isPrintMode ? ' is-print-square' : ''}">
      <img class="c-photo-img ${fitClass}" ${scaleStyle} src="${displayImg}" alt="${cData.name || ''}" ${loadingAttr}>
    </div>
  `;
}

// Highlight keywords and replace bracketed faction terms with official inline icons
function formatEffectText(text, lang) {
    if (!text || text.trim() === '') {
        return '';
    }

    let formatted = text;

    // Substitute BGA placeholder tokens
    formatted = formatted
        .replace(/\$\{CITY\}/g, '[Ciudad]')
        .replace(/\$\{CASTLE\}/g, '[Castillo]')
        .replace(/\$\{FILMSTUDIO\}/g, '[Cine]')
        .replace(/\$\{FUNFAIR\}/g, '[Feria]')
        .replace(/\$\{HAUNTEDHOUSE\}/g, '[Casa del Terror]')
        .replace(/\$\{OUTERSPACE\}/g, '[Espacio]')
        .replace(/\$\{SHIPWRECK\}/g, '[Naufragio]')
        .replace(/\$\{RAINBOW\}/g, '[Arcoíris]')
        .replace(/\$\{NEWLINE\}/g, '<br>')
        .replace(/\n/g, '<br>');

    // Markdown italics _..._ to <strong>...</strong>
    formatted = formatted.replace(/_([^_]+)_/g, '<strong>$1</strong>');

    const keywords = [
        // Spanish
        'Desde el banquillo:',
        'Durante el ataque:',
        'En posesión de la Bandera:',
        'En posesión de la bandera:',
        'Al perder la Bandera:',
        'Pérdida de bandera:',
        'Sin captura de Bandera:',
        'Al reclutar:',
        'Al cogerla:',
        'Al elegirse:',
        'Insuficiente:',
        'Al ser seleccionada:',
        'Especial:',
        'Dale la vuelta a esta carta:',
        'Voltea esta carta:',
        'En cada fase de Planificación:',
        'Fase de Planificación Ronda 1:',
        'Inicio de cada combate:',
        // French
        'Depuis le banc :',
        'Depuis le banc:',
        'Durant l\'attaque :',
        'Pendant l\'attaque :',
        'Pendant l\'attaque:',
        'En possession du drapeau :',
        'En possession du drapeau:',
        'Perte du drapeau :',
        'Perte du drapeau:',
        'Au recrutement :',
        'Au recrutement:',
        'Insuffisant :',
        // English
        'From the bench:',
        'During the attack:',
        'In flag possession:',
        'Flag loss:',
        'When picked:',
        'Flip this card:',
        'Rare 3x',
        'Rare 2x',
        'Common 8x',
        'Common 5x',
        // German
        'Von der Bank:',
        'Beim Angriff:',
        'Im Flaggenbesitz:',
        'Bei Flaggenverlust:',
        'Beim Rekrutieren:',
        'Drehe diese Karte um:',
        'In jeder Planungsphase:',
        'Zu Beginn jedes Kampfes:',
        // Dutch
        'Vanaf de bank:',
        'Tijdens de aanval:',
        'In vlagbezit:',
        'Bij vlagverlies:',
        'Bij het rekruteren:',
        'Draai deze kaart om:',
        'In elke planningsfase:',
        'Aan het begin van elk gevecht:',
        // Italian
        'Dalla panchina:',
        'Durante l\'attacco:',
        'Durante l\'Attacco:',
        'In possesso della bandiera:',
        'In possesso della Bandiera:',
        'Alla perdita della bandiera:',
        'Perdita della bandiera:',
        'Al reclutamento:',
        'Gira questa carta:',
        'In ogni fase di pianificazione:',
        'Inizio di ogni combattimento:'
    ];

    keywords.forEach(kw => {
        const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        formatted = formatted.replace(re, `<strong>${kw}</strong>`);
    });

    // Official Inline Icons for Factions & Game Terms dynamically resolved from active deck
    const factionSetMapping = [
        { regex: /\[(?:Ciudad|Cuidad|Ville|City|Stadt|Stad|Citt[aà]|Pok[eé]ball)\]/gi, setId: 'city', fallbackName: 'Ciudad', fallbackIcon: 'icon_ville.png' },
        { regex: /\[(?:Robot|Robots|Roboter|Gary|Rival)\]/gi, setId: 'robot', fallbackName: 'Robot', fallbackIcon: '' },
        { regex: /\[(?:Playa|Club\s+de\s+Playa|Plage|Beach|Strandclub|Strand(?:\s*Club)?|Spiaggia|Agua|Water)\]/gi, setId: 'beach_club', fallbackName: 'Playa / Agua', fallbackIcon: 'icon_plage.png' },
        { regex: /\[(?:Cuentos(?:\s+de\s+hadas)?|Bosque\s+M[aá]gico|Contes(?:\s+de\s+f[eé]es)?|For[eê]t\s+enchant[eé]e|Fairy\s*Tales?|Fairytale\s*Forest|M[aä]rchenwald|M[aä]rchen|Sprookjesbos|Sprookje|Bosco\s+Incantato|Fiaba|Fiabe|Roca|Tierra|Rock|Ground|Fee|Folletto)\]/gi, setId: 'fairytale_forest', fallbackName: 'Cuentos de hadas / Roca', fallbackIcon: 'icon_contes.png' },
        { regex: /\[(?:Monta[ñn]a|Montagne|Sommet\s+montagneux|Mountain(?:\s*Top)?|Berggipfel|Bergtop|Cima\s+della\s+Montagna|Berg|Gebirge|Hielo|Ice)\]/gi, setId: 'mountain_top', fallbackName: 'Montaña / Hielo', fallbackIcon: 'icon_montagne.png' },
        { regex: /\[(?:Juguetes(?:\/Puzzle)?|Jugueter[ií]a|Jouets(?:\/Puzzle)?|Magasin\s+de\s+jouets|Toys?|Toy\s*Store|Spielzeugladen|Spielzeug|Speelgoedwinkel|Speelgoed|Negozio\s+di\s+Giocattoli|Giocattoli|El[eé]ctrico|Electric|Electrik)\]/gi, setId: 'toy_store', fallbackName: 'Juguetes / Eléctrico', fallbackIcon: 'icon_jouets.png' },
        { regex: /\[(?:Infiltraci[oó]n|Base\s+secreta|Infiltration|Base\s+secr[eè]te|Secret\s*Base|Geheimbasis|Geheime\s+Basis|Base\s+Segreta|Infiltrazione|Normal)\]/gi, setId: 'secret_base', fallbackName: 'Infiltración / Normal', fallbackIcon: 'icon_infiltration.png' },
        { regex: /\[(?:Universidad|Universit[eé]|University|Universit[aä]t|Universiteit|Lucha|Combat|Fighting)\]/gi, setId: 'university', fallbackName: 'Universidad / Lucha', fallbackIcon: 'icon_universite.png' },
        { regex: /\[(?:Arco[ií]ris|Arc-en-ciel|Rainbow|Regenbogen|Regenboog|Arcobaleno|Hada|M[ií]tico|Fairy)\]/gi, setId: 'rainbow', fallbackName: 'Arcoíris / Hada', fallbackIcon: 'icon_arcenciel.png' },
        { regex: /\[(?:Castillo|Ch[aâ]teau|Castle|Schloss|Burg|Kasteel|Veneno|Poison)\]/gi, setId: 'castle', fallbackName: 'Castillo / Veneno', fallbackIcon: 'icon_chateau.png' },
        { regex: /\[(?:Cine|Estudio\s+de\s+Cine|Cin[eé]ma|Studio\s+de\s+cin[eé]ma|Cinema|Film(?:\s*Studio)?|Studio\s+Cinematografico|Bioscoop|Kino|Volador|Drag[oó]n|Flying|Dragon)\]/gi, setId: 'film_studio', fallbackName: 'Cine / Volador / Dragón', fallbackIcon: 'icon_cinema.png' },
        { regex: /\[(?:Feria|Foire|Funfair|Kirmes|Kermis|Luna\s*Park|Rummel|Ps[ií]quico|Psychic|Fantasma|Ghost)\]/gi, setId: 'funfair', fallbackName: 'Feria / Psíquico', fallbackIcon: 'icon_foire.png' },
        { regex: /\[(?:Casa\s+del\s+Terror|Casa\s+embrujada|Maison\s+Hant[eé]e|Haunted\s*House|Geisterhaus|Spookhuis|Casa\s+Stregata|Bicho|Insecte|Bug)\]/gi, setId: 'haunted_house', fallbackName: 'Casa del Terror / Bicho', fallbackIcon: 'icon_hantee.png' },
        { regex: /\[(?:Espacio(?:\s+exterior)?|Espace|Space|Weltraum|Ruimte|Spazio(?:\s+Profondo)?|All|Planta|Plante|Grass)\]/gi, setId: 'outer_space', fallbackName: 'Espacio / Planta', fallbackIcon: 'icon_espace.png' },
        { regex: /\[(?:Naufragio|[EÉ]pave|Shipwreck|Schiffswrack|Scheepswrak|Relitto|Wrack|Wrak|Fuego|Feu|Fire)\]/gi, setId: 'shipwreck', fallbackName: 'Naufragio / Fuego', fallbackIcon: 'icon_epave.png' },
        { regex: /\[(?:Entrenador(?:es)?|Entra[iî]neur(?:s)?|Trainer(?:s)?|Allenator(?:e|i)?|L[ií]der(?:es)?(?:\s+de\s+Gimnasio)?)\]/gi, setId: 'trainers', fallbackName: 'Entrenadores / Líderes', fallbackIcon: 'icon_lideres.png' },
        { regex: /\[(?:(?:Dioses\s+)?[EÉ]gipcios?|(?:Egyptian\s+)?Gods?|[AÄ]gypter|[EÉ]gyptiens?|Egitto|Egizi|Egyptisch\s+Pantheon|[AÄ]gyptisches\s+Pantheon|Pantheon\s+Egizio|Dieux\s+[EÉ]gyptiens)\]/gi, setId: 'dioses_egipcios', fallbackName: 'Dioses Egipcios', fallbackIcon: 'icon_dioses_egipcios.png' },
        { regex: /\[(?:(?:Dioses\s+)?Griegos?|(?:Greek\s+)?Gods?|Griechen|Grecs?|Grecia|Greci|Grieks\s+Pantheon|Griechisches\s+Pantheon|Pantheon\s+Greco|Dieux\s+Grecs)\]/gi, setId: 'dioses_griegos', fallbackName: 'Dioses Griegos', fallbackIcon: 'icon_dioses_griegos.png' },
        { regex: /\[(?:(?:Dioses\s+)?Hind[uú](?:es)?|(?:Hindu\s+)?Gods?|Ind[uù]|Hindoe[iï]stisch\s+Pantheon|Hindug[oö]tter|Pantheon\s+Ind[uù]|Dieux\s+Hindous)\]/gi, setId: 'dioses_hindu', fallbackName: 'Dioses Hindúes', fallbackIcon: 'icon_dioses_hindu.png' },
        { regex: /\[(?:(?:Dioses\s+)?N[oó]rdicos?|(?:Norse|Nordic)\s+Gods?|Norse|Nordic|Nordisch|Nordiques?|Norreni|Noors\s+Pantheon|Nordisches\s+Pantheon|Pantheon\s+Norreno|Dieux\s+Nordiques)\]/gi, setId: 'dioses_nordicos', fallbackName: 'Dioses Nórdicos', fallbackIcon: 'icon_dioses_nordicos.png' },
        { regex: /\[(?:(?:Figuras?\s+)?Cristian[ao]s?|(?:Christian|Biblical)\s+Figures?|Christlich|Chr[eé]tien(?:ne)?s?|Cristiani|Christelijke\s+Figuren|Biblische\s+Figuren|Figure\s+Cristiane|Figures\s+Chr[eé]tiennes)\]/gi, setId: 'dioses_cristianos', fallbackName: 'Figuras Cristianas', fallbackIcon: 'icon_dioses_cristianos.png' },
        // 12 Custom Expansion Factions
        { regex: /\[(?:Secta(?:\s+Oscura)?|Dark\s+Cult|Culte\s+Sombre|Dunkler\s+Kult|Duistere\s+Sekte|Setta\s+Oscura|Cult)\]/gi, setId: 'custom_cult', fallbackName: 'Secta Oscura', fallbackIcon: 'icon_cult.png' },
        { regex: /\[(?:Inframundo|Underworld|Enfers|Unterwelt|Onderwereld|Oltretomba)\]/gi, setId: 'custom_underworld', fallbackName: 'Inframundo', fallbackIcon: 'icon_underworld.png' },
        { regex: /\[(?:Jap[oó]n(?:\s+Feudal)?|Feudal\s+Japan|Japon\s+F[eé]odal|Feudales\s+Japan|Feodaal\s+Japan|Giappone\s+Feudale)\]/gi, setId: 'custom_feudal_japan', fallbackName: 'Japón Feudal', fallbackIcon: 'icon_feudal_japan.png' },
        { regex: /\[(?:Prehistoria|Prehistoric|Pr[eé]histoire|Urzeit|Prehistorie|Preistoria)\]/gi, setId: 'custom_prehistoric', fallbackName: 'Prehistoria', fallbackIcon: 'icon_prehistoric.png' },
        { regex: /\[(?:Viejo\s+Oeste|Wild\s+West|Far\s+West|Wilder\s+Westen|Wilde\s+Westen|Vecchio\s+West|Oeste|Western)\]/gi, setId: 'custom_western', fallbackName: 'Viejo Oeste', fallbackIcon: 'icon_western.png' },
        { regex: /\[(?:Celestial|C[eé]leste|Himmlisch|Hemels)\]/gi, setId: 'custom_celestial', fallbackName: 'Celestial', fallbackIcon: 'icon_celestial.png' },
        { regex: /\[(?:Fuerza\s+A[eé]rea|Air\s+Force|Forces\s+A[eé]riennes|Luftwaffe|Luchtmacht|Aeronautica)\]/gi, setId: 'custom_air_force', fallbackName: 'Fuerza Aérea', fallbackIcon: 'icon_air_force.png' },
        { regex: /\[(?:Casino(?:\s+y\s+Apuestas)?|Kasino|Casin[oò])\]/gi, setId: 'custom_casino', fallbackName: 'Casino', fallbackIcon: 'icon_casino.png' },
        { regex: /\[(?:Mitolog[ií]a(?:\s+Cl[aá]sica)?|Mythology|Mythologie|Mitologia)\]/gi, setId: 'custom_mythology', fallbackName: 'Mitología Clásica', fallbackIcon: 'icon_mythology.png' },
        { regex: /\[(?:Eruditos(?:\s+y\s+Museo)?|Scholars|[EÉ]rudits|Gelehrte|Geleerden|Eruditi)\]/gi, setId: 'custom_scholars', fallbackName: 'Eruditos y Museo', fallbackIcon: 'icon_scholars.png' },
        { regex: /\[(?:Infiltraci[oó]n(?:\s+Espacial)?|Space\s+Impostor|Imposteur\s+Spatial|Weltraum[\s-]Infiltrator|Ruimte[\s-]Infiltrant|Infiltrazione\s+Spaziale|Impostor)\]/gi, setId: 'custom_impostor', fallbackName: 'Infiltración Espacial', fallbackIcon: 'icon_impostor.png' },
        { regex: /\[(?:(?:Antiguo\s+)?Egipto|Ancient\s+Egyptian|[EÉ]gypte(?:\s+Ancienne)?|Altes\s+[AÄ]gypten|Oude\s+Egypte|Antico\s+Egitto)\]/gi, setId: 'custom_egyptian', fallbackName: 'Antiguo Egipto', fallbackIcon: 'icon_egyptian.png' }
    ];

    factionSetMapping.forEach(item => {
        const setInfo = setsData[item.setId] || {};
        const iconFile = setInfo.icon_path || item.fallbackIcon;
        const displayName = setInfo.name?.[lang] || setInfo.name?.['es'] || setInfo.name?.['en'] || item.fallbackName;
        if (iconFile) {
            const iconSrc = getFactionIconPath(iconFile);
            formatted = formatted.replace(item.regex, `<span class="c-inline-icon-wrap" title="${displayName}"><img class="c-inline-icon" src="${iconSrc}" alt="${displayName}"></span>`);
        } else {
            formatted = formatted.replace(item.regex, `<strong class="c-inline-faction-name">${displayName}</strong>`);
        }
    });

    // Dynamic set names matcher for any loaded deck
    if (typeof setsData === 'object' && setsData) {
        Object.keys(setsData).forEach(sid => {
            const s = setsData[sid];
            if (!s || !s.icon_path) return;
            const names = [];
            if (typeof s.name === 'object' && s.name) {
                Object.values(s.name).forEach(val => {
                    if (val && typeof val === 'string') {
                        names.push(val.trim());
                        const noParen = val.replace(/\s*\([^)]*\)/g, '').trim();
                        if (noParen && noParen !== val.trim()) names.push(noParen);
                    }
                });
            } else if (typeof s.name === 'string') {
                names.push(s.name.trim());
                const noParen = s.name.replace(/\s*\([^)]*\)/g, '').trim();
                if (noParen && noParen !== s.name.trim()) names.push(noParen);
            }
            names.push(sid);
            // Sort names by length descending to match longest phrases first
            names.sort((a, b) => b.length - a.length);
            names.forEach(n => {
                if (!n || n.length < 2) return;
                const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const r = new RegExp(`\\[${esc}\\]`, 'gi');
                const iconSrc = getFactionIconPath(s.icon_path);
                const displayName = s.name?.[lang] || s.name?.es || s.name?.en || n;
                formatted = formatted.replace(r, `<span class="c-inline-icon-wrap" title="${displayName}"><img class="c-inline-icon" src="${iconSrc}" alt="${displayName}"></span>`);
            });
        });
    }

    // General game tokens
    const generalTokens = [
        { regex: /\[(?:Fan|Fans)\]/gi, icon: 'icon_fan.png', name: 'Fan' },
        { regex: /\[(?:Trofeo|Troph[eé]e|Trophy|Troph[aä]e|Pokal|Trofee|Medalla|Medallas|Badge)\]/gi, icon: setsData['trainers']?.icon_path || 'icon_trophy.png', name: 'Trofeo / Medalla' },
        { regex: /\[(?:Carta|Carte|Card|Karte|Kaart)\]/gi, icon: 'icon_card.png', name: 'Carta' },
        { regex: /\[(?:Bandera|Drapeau|Flag|Flagge|Vlag|Bandiera)\]/gi, icon: setsData['city']?.icon_path || 'icon_ville.png', name: 'Bandera / Pokéball' }
    ];

    generalTokens.forEach(item => {
        const iconSrc = getFactionIconPath(item.icon);
        formatted = formatted.replace(item.regex, `<span class="c-inline-icon-wrap" title="${item.name}"><img class="c-inline-icon" src="${iconSrc}" alt="${item.name}"></span>`);
    });

    return formatted;
}

// Modal Logic
// =============================================================================
// SECCIÓN 13: MODALES DE DETALLE E INSPECCIÓN TRIDIMENSIONAL DE CARTA (3D)
// =============================================================================
/**
 * Abre el modal de inspección en alta resolución para la carta seleccionada.
 * 
 * @param {number|string} cardId - Identificador único de la carta.
 * @param {Event} [event] - Evento de clic en el DOM.
 */
function openModal(cardId, event) {
    if (event) event.stopPropagation();
    const index = visibleCardIds.indexOf(cardId);
    if (index === -1) return;
    currentModalCardIndex = index;
    renderModalCard(currentModalCardIndex);

    const modal = document.getElementById('cardModal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

/**
 * Cierra el modal de inspección de carta y restablece los estados de foco.
 */
function closeModal() {
    const modal = document.getElementById('cardModal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentModalCardIndex = -1;
}

/**
 * Navega a la carta anterior dentro del conjunto de cartas actualmente visibles en la galería.
 */
function showPrevModalCard() {
    if (visibleCardIds.length <= 1) return;
    currentModalCardIndex = (currentModalCardIndex - 1 + visibleCardIds.length) % visibleCardIds.length;
    renderModalCard(currentModalCardIndex);
}

/**
 * Navega a la carta siguiente dentro del conjunto de cartas actualmente visibles en la galería.
 */
function showNextModalCard() {
    if (visibleCardIds.length <= 1) return;
    currentModalCardIndex = (currentModalCardIndex + 1) % visibleCardIds.length;
    renderModalCard(currentModalCardIndex);
}

function openFullArtworkWindow(url, title) {
    if (!url) return;
    try {
        const w = window.open('', '_blank');
        if (w) {
            w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${title || 'Ilustración Completa'}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 52px;
      padding: 0 20px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 100;
    }
    .title {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      letter-spacing: 0.3px;
    }
    .btn-download {
      background: #0284c7;
      color: #ffffff;
      text-decoration: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.2s;
    }
    .btn-download:hover {
      background: #0369a1;
    }
    .img-container {
      margin-top: 52px;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      max-width: 100vw;
      max-height: calc(100vh - 52px);
    }
    img {
      max-width: 95vw;
      max-height: calc(95vh - 70px);
      object-fit: contain;
      border-radius: 10px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${title || 'Ilustración Completa'}</div>
    <a href="${url}" download="${(title || 'carta').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg" class="btn-download">⬇ Descargar Imagen</a>
  </div>
  <div class="img-container">
    <img src="${url}" alt="${title}">
  </div>
</body>
</html>`);
            w.document.close();
            return;
        }
    } catch (e) {
        console.warn('Could not open custom artwork window, falling back:', e);
    }
    window.open(url, '_blank');
}

/**
 * Renderiza en el modal de detalle la carta correspondiente al índice especificado de visibleCardIds.
 * 
 * @param {number} index - Índice en el array visibleCardIds.
 */
function renderModalCard(index) {
    const cardId = visibleCardIds[index];
    const card = cardsData.find(c => c.id === cardId);
    if (!card) return;

    const t = i18n[currentLang];
    const cData = card[currentLang] || card['es'] || card['en'] || {};
    const modalBody = document.getElementById('modalBody');

    const setInfo = setsData[card.set_id] || {};
    const setName = setInfo.name?.[currentLang] || setInfo.name?.['es'] || card.set_id;
    const setHex = setInfo.color_hex || '#0284c7';
    const iconImgHTML = setInfo.icon_path
        ? `<img class="tag-icon-img" src="${getFactionIconPath(setInfo.icon_path)}" alt="${setName}">`
        : '';

    const isBeach = card.game === 'c2' || (card.game && card.game.includes('Beach Cup'));
    const gameBadge = getCardCollectionName(card);
    const badgeStyle = isBeach ? 'background: #f59e0b; color: #000;' : (gameBadge.includes('Pokémon') ? 'background: #facc15; color: #854d0e;' : 'background: #38bdf8; color: #000;');
    const fullImgPath = getCardImagePath(card.card_image || card.digital_card_path || card.card_path) || getArtImagePath(card.art_image || card.card_image);

    // Starter player variants HTML
    let starterVariantsHTML = '';
    if (card.is_starter_card && card.player_variants && card.player_variants.length > 0) {
        const starterCopiesText = typeof t.starterCopiesText === 'function'
            ? t.starterCopiesText(card.deck_copies_per_player || 1, card.default_copies)
            : `${card.deck_copies_per_player || 1}x por jugador (${card.default_copies} total)`;
        const starterDesc = t.starterDescText || 'Esta carta cuenta con 8 versiones físicas, una por cada icono de jugador del torneo:';

        starterVariantsHTML = `
      <div class="modal-section modal-starter-section">
        <div class="modal-section-title-row">
          <span class="modal-section-title">${t.starterDeckLabel || 'Mazo Inicial (8 Variantes de Torneo)'}</span>
          <span class="starter-meta-pill">${starterCopiesText}</span>
        </div>
        <div class="starter-section-desc">
          ${starterDesc}
        </div>
        <div class="starter-variants-bar" id="starterVariantsBar">
          ${card.player_variants.map((v, pIdx) => `
            <button type="button" class="player-variant-chip ${pIdx === 0 ? 'active' : ''}" data-img="${v.image}" data-icon="${v.icon}">
              <span class="player-variant-icon-wrap">${PLAYER_ICONS_SVG[v.icon] || '●'}</span>
              <span>J${v.player_id}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    }

    modalBody.innerHTML = `
    <div class="modal-grid">
      <!-- Left: 3D Flip Interactive Card Display -->
      <div class="modal-card-display" id="modalCardDisplay">
        <div class="c-flipper" id="modalFlipper">
          <div class="c-front">
            ${createCardTemplateHTML(card, currentLang)}
          </div>
          <div class="c-back">
            ${createPhotoCardHTML(card, currentLang)}
          </div>
        </div>

        <div class="modal-flip-btn-row">
          <button type="button" class="modal-flip-btn" id="modalFlipBtn">
            ${t.modalFlipBtnText || 'Voltear carta (3D)'}
          </button>
        </div>
      </div>

      <!-- Right: Detailed Information -->
      <div class="modal-details">
        <div class="modal-header-info">
          <div class="modal-card-title">#${card.id} ${cData.name}</div>
          <div class="modal-card-lang-row">
            <span>ES: <strong>${card.es?.name || '-'}</strong></span>
            <span class="lang-separator">·</span>
            <span>FR: <strong>${card.fr?.name || '-'}</strong></span>
            <span class="lang-separator">·</span>
            <span>EN: <strong>${card.en?.name || '-'}</strong></span>
            ${card.de?.name ? `<span class="lang-separator">·</span><span>DE: <strong>${card.de.name}</strong></span>` : ''}
            ${card.nl?.name ? `<span class="lang-separator">·</span><span>NL: <strong>${card.nl.name}</strong></span>` : ''}
            ${card.it?.name ? `<span class="lang-separator">·</span><span>IT: <strong>${card.it.name}</strong></span>` : ''}
          </div>
          <div class="modal-card-tags">
            <span class="tag-badge" style="${badgeStyle} font-weight: 700;">
              ${gameBadge}
            </span>
            <span class="tag-badge" style="background: ${setHex}; color: #fff;">
              ${iconImgHTML} ${setName}
            </span>
            ${isMacroDogCard(card) ? `
              <span class="tag-badge modal-macro-pill">
                🏆 ${currentLang === 'fr' ? 'Macrotournoi (16J)' : (currentLang === 'en' ? 'Macrotournament (16P)' : (currentLang === 'de' ? 'Makroturnier (16S)' : (currentLang === 'nl' ? 'Macrotoernooi (16S)' : (currentLang === 'it' ? 'Macrotorneo (16G)' : 'Macrotorneo (16J)'))))}
              </span>
            ` : (card.player_id && (card.level === 'S' || card.is_starter_card) && !isRobotCard(card) ? `
              <span class="tag-badge modal-player-pill" style="border-left: 3px solid ${getPlayerConfig(card.player_id).color};">
                ${getPlayerIconHTML(getPlayerConfig(card.player_id).code || card.player_id)} ${sT?.playerPrefix || (currentLang === 'it' ? 'Giocatore' : (currentLang === 'de' ? 'Spieler' : (currentLang === 'nl' ? 'Speler' : (currentLang === 'fr' ? 'Joueur' : (currentLang === 'en' ? 'Player' : 'Jugador')))))} ${card.player_id} · ${getPlayerConfig(card.player_id).name[currentLang] || getPlayerConfig(card.player_id).name.es}
              </span>
            ` : '')}
            <span class="tag-badge tag-level">
              ${t.modalLevel}: ${card.level}
            </span>
            <span class="tag-badge tag-strength">
              ${t.modalStrength}: ${card.strength}
            </span>
            <span class="tag-badge modal-copies-tag">
              ${card.default_copies} ${currentLang === 'fr' ? 'exemplaires dans le paquet' : (currentLang === 'en' ? 'copies in deck' : (currentLang === 'de' ? 'Exemplare im Deck' : (currentLang === 'nl' ? 'exemplaren in het deck' : (currentLang === 'it' ? 'copie nel mazzo' : 'copias en el mazo'))))}
            </span>
          </div>
        </div>

        ${isMacroDogCard(card) ? `
          <div class="modal-section modal-macro-notice">
            <div class="modal-section-title-row">
              <span class="modal-section-title">🏆 ${currentLang === 'fr' ? 'Variante Spéciale Macrotournoi' : (currentLang === 'en' ? 'Special Macrotournament Variant' : (currentLang === 'de' ? 'Spezielle Makroturnier-Variante' : (currentLang === 'nl' ? 'Speciale Macrotoernooi-variant' : (currentLang === 'it' ? 'Variante Speciale Macrotorneo' : 'Variante Especial de Macrotorneo'))))}</span>
              <span class="starter-meta-pill">16 ${currentLang === 'fr' ? 'Joueurs' : (currentLang === 'en' ? 'Players' : (currentLang === 'de' ? 'Spieler' : (currentLang === 'nl' ? 'Spelers' : (currentLang === 'it' ? 'Giocatori' : 'Jugadores'))))}</span>
            </div>
            <div class="modal-macro-notice-desc">
              ${currentLang === 'fr'
                ? `Cette carte Chien correspond au <strong>Joueur ${card.player_id} (${getPlayerConfig(card.player_id).name.fr || getPlayerConfig(card.player_id).name.es})</strong> et est utilisée exclusivement pour les tournois jusqu'à 16 joueurs. <em>Elle est strictement séparée car elle ne fait pas partie du deck de départ standard.</em>`
                : (currentLang === 'en'
                    ? `This Dog card corresponds to <strong>Player ${card.player_id} (${getPlayerConfig(card.player_id).name.en || getPlayerConfig(card.player_id).name.es})</strong> and is used exclusively for tournaments up to 16 players. <em>It is strictly separated as it is not part of the standard starter deck.</em>`
                    : (currentLang === 'de'
                        ? `Diese Hundekarte entspricht <strong>Spieler ${card.player_id} (${getPlayerConfig(card.player_id).name.de || getPlayerConfig(card.player_id).name.es})</strong> und wird ausschließlich für Turniere mit bis zu 16 Spielern verwendet. <em>Sie ist strikt getrennt, da sie nicht Teil des Standard-Startdecks ist.</em>`
                        : (currentLang === 'nl'
                            ? `Deze hondenkaart hoort bij <strong>Speler ${card.player_id} (${getPlayerConfig(card.player_id).name.nl || getPlayerConfig(card.player_id).name.es})</strong> en wordt exclusief gebruikt voor toernooien tot 16 spelers. <em>Deze kaart is strikt gescheiden omdat ze geen deel uitmaakt van het standaard startdeck.</em>`
                            : (currentLang === 'it'
                                ? `Questa carta Cane corrisponde al <strong>Giocatore ${card.player_id} (${getPlayerConfig(card.player_id).name.it || getPlayerConfig(card.player_id).name.es})</strong> ed è utilizzata esclusivamente per tornei fino a 16 giocatori. <em>È rigorosamente separata poiché non fa parte del mazzo iniziale standard.</em>`
                                : `Esta carta de Perro corresponde al <strong>Jugador ${card.player_id} (${getPlayerConfig(card.player_id).name.es})</strong> y se utiliza exclusivamente para partidas de macrotorneo de hasta 16 jugadores combinando dos cajas oficiales. <em>Está claramente separada ya que no forma parte del mazo inicial estándar de cada jugador.</em>`))))}
            </div>
          </div>
        ` : (card.player_id && (card.level === 'S' || card.is_starter_card) && !isRobotCard(card) ? `
          <div class="modal-section modal-starter-player-notice">
            <div class="modal-section-title-row">
              <span class="modal-section-title">${currentLang === 'fr' ? 'Deck Initial de Tournoi' : (currentLang === 'en' ? 'Tournament Starter Deck' : (currentLang === 'de' ? 'Turnier-Startdeck' : (currentLang === 'nl' ? 'Toernooi Startdeck' : (currentLang === 'it' ? 'Mazzo Iniziale di Torneo' : 'Mazo Inicial de Torneo'))))}</span>
              <span class="starter-meta-pill">${sT?.playerPrefix || (currentLang === 'it' ? 'Giocatore' : (currentLang === 'de' ? 'Spieler' : (currentLang === 'nl' ? 'Speler' : (currentLang === 'fr' ? 'Joueur' : (currentLang === 'en' ? 'Player' : 'Jugador')))))} ${card.player_id} · ${getPlayerConfig(card.player_id).name[currentLang] || getPlayerConfig(card.player_id).name.es}</span>
            </div>
            <div class="starter-section-desc">
              ${currentLang === 'fr'
                ? `Fait partie du deck initial officiel de 6 cartes physiques de ce joueur.`
                : (currentLang === 'en'
                    ? `Part of this player's official 6-card starter deck.`
                    : (currentLang === 'de'
                        ? `Teil des offiziellen 6-Karten-Startdecks dieses Spielers.`
                        : (currentLang === 'nl'
                            ? `Onderdeel van het officiële startdeck van 6 kaarten van deze speler.`
                            : (currentLang === 'it'
                                ? `Fa parte del mazzo iniziale ufficiale di 6 carte fisiche di questo giocatore.`
                                : `Forma parte del mazo inicial oficial de 6 cartas de este jugador.`))))}
            </div>
          </div>
        ` : '')}

        ${starterVariantsHTML}

        <!-- Effect Description Box -->
        <div class="modal-section">
          <div class="modal-section-title">${currentLang === 'fr' ? 'Effet' : (currentLang === 'en' ? 'Effect' : (currentLang === 'de' ? 'Effekt' : (currentLang === 'nl' ? 'Effect' : (currentLang === 'it' ? 'Effetto' : 'Efecto'))))}</div>
          <div class="modal-text-content">
            ${renderEffectBoxHTML(cData.text, currentLang, card)}
          </div>
        </div>

        <!-- Multilingual Equivalents -->
        <div class="modal-section modal-translations-section">
          <div class="modal-section-title">${currentLang === 'fr' ? 'Traductions' : (currentLang === 'en' ? 'Translations' : (currentLang === 'de' ? 'Übersetzungen' : (currentLang === 'nl' ? 'Vertalingen' : (currentLang === 'it' ? 'Traduzioni' : 'Traducciones'))))}</div>
          <div class="modal-translations-list">
            <div><strong>Español:</strong> ${card.es?.text || '-'}</div>
            <div><strong>Français:</strong> ${card.fr?.text || '-'}</div>
            <div><strong>English:</strong> ${card.en?.text || '-'}</div>
            ${card.de?.text ? `<div><strong>Deutsch:</strong> ${card.de.text}</div>` : ''}
            ${card.nl?.text ? `<div><strong>Nederlands:</strong> ${card.nl.text}</div>` : ''}
            ${card.it?.text ? `<div><strong>Italiano:</strong> ${card.it.text}</div>` : ''}
          </div>
        </div>

        <!-- Source Image Info -->
        <div class="modal-section modal-source-section">
          <div class="modal-section-title">${t.modalSource || 'Imagen Fuente'}</div>
          <div class="modal-source-row">
            <span class="modal-source-meta">${card.game || gameBadge} &bull; ${currentLang === 'fr' ? 'Carte' : (currentLang === 'en' ? 'Card' : (currentLang === 'de' ? 'Karte' : (currentLang === 'nl' ? 'Kaart' : (currentLang === 'it' ? 'Carta' : 'Carta'))))} #${card.id}</span>
            <a href="${fullImgPath}" target="_blank" class="modal-source-link" id="modalViewArtworkBtn">${currentLang === 'fr' ? 'Voir illustration complète ↗' : (currentLang === 'en' ? 'View full artwork ↗' : (currentLang === 'de' ? 'Vollständiges Artwork anzeigen ↗' : (currentLang === 'nl' ? 'Volledige illustratie bekijken ↗' : (currentLang === 'it' ? 'Vedi illustrazione completa ↗' : 'Ver ilustración completa ↗'))))}</a>
          </div>
        </div>
      </div>
    </div>
  `;

    // Open full artwork in dark mode window
    const artworkBtn = document.getElementById('modalViewArtworkBtn');
    if (artworkBtn) {
        artworkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const cardTitle = `#${card.id} ${cData.name || ''}`;
            openFullArtworkWindow(fullImgPath, cardTitle);
        });
    }

    // Flip button event in modal
    const modalDisplay = document.getElementById('modalCardDisplay');
    const modalFlipBtn = document.getElementById('modalFlipBtn');
    modalFlipBtn.addEventListener('click', () => {
        modalDisplay.classList.toggle('is-flipped');
    });

    // Player variant click event in modal
    const variantsBar = document.getElementById('starterVariantsBar');
    if (variantsBar) {
        variantsBar.querySelectorAll('.player-variant-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                variantsBar.querySelectorAll('.player-variant-chip').forEach(b => {
                    b.style.background = '#0f172a';
                });
                btn.style.background = '#0284c7';
                const imgName = btn.dataset.img;
                const iconName = btn.dataset.icon;
                const backImg = modalDisplay.querySelector('.c-back img');
                if (backImg && imgName) {
                    backImg.src = getCardImagePath(imgName);
                }
                const frontPlayerIcon = modalDisplay.querySelector('.c-starter-player-icon');
                if (frontPlayerIcon && iconName) {
                    frontPlayerIcon.innerHTML = `<img src="images/icons/player_icon_${iconName}.png" class="player-icon-img" alt="${iconName}">`;
                }
            });
        });
    }
}

/* ==========================================================================
   Print & PDF Generator Logic (Exact 63.5 x 88 mm on A4, 3x3 layout, Square Corners)
   ========================================================================== */

// =============================================================================
// SECCIÓN 14: MÓDULO DE IMPRESIÓN, DISTRIBUCIÓN DE COPIAS Y EXPORTACIÓN A PDF
// =============================================================================
/**
 * Notificación toast flotante en pantalla.
 * @param {string} msg - Mensaje a mostrar.
 */
function showToast(msg) {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
}

/**
 * Calcula la suma total de copias físicas de cartas seleccionadas para impresión en el mazo.
 * 
 * @returns {number} Número total de cartas físicas a imprimir.
 */
function getTotalPrintCopies() {
    let sum = 0;
    printQuantities.forEach(qty => { sum += qty; });
    return sum;
}

/**
 * Sincroniza y actualiza los badges y etiquetas de conteo de copias en el botón de impresión y modales.
 */
function updatePrintBadge() {
    const uniqueCount = printQuantities.size;
    const totalCopies = getTotalPrintCopies();
    const { mode } = getPrintOptions();
    const isStrips = (mode === 'strips');
    const perPage = isStrips ? 27 : 9;
    const t = i18n[currentLang] || i18n.es;
    const tp = t.print || {};

    const countEl = document.getElementById('printSelectedCount');
    if (countEl) countEl.textContent = totalCopies;

    const pillEl = document.getElementById('printCountPill');
    if (pillEl) {
        pillEl.textContent = `${totalCopies} ${tp.cardsWord || (currentLang === 'fr' ? 'exemplaires' : (currentLang === 'en' ? 'copies' : 'copias'))} (${uniqueCount} ${tp.typesSuffix || (currentLang === 'fr' ? 'types' : (currentLang === 'en' ? 'types' : 'tipos'))})`;
    }

    const calcUnique = document.getElementById('printCalcUnique');
    if (calcUnique) {
        calcUnique.textContent = `${uniqueCount} ${tp.typesSuffix || (currentLang === 'fr' ? 'types' : (currentLang === 'en' ? 'types' : 'tipos'))}`;
    }

    const calcCards = document.getElementById('printCalcCards');
    if (calcCards) {
        calcCards.textContent = isStrips
            ? `${totalCopies} ${tp.stripsTextSuffix || (currentLang === 'fr' ? 'bandes de texte' : (currentLang === 'en' ? 'text strips' : 'tiras de texto'))}`
            : `${totalCopies} ${tp.cardsPhysicalSuffix || (currentLang === 'fr' ? 'cartes physiques' : (currentLang === 'en' ? 'physical cards' : 'cartas físicas'))}`;
    }

    const calcPages = document.getElementById('printCalcPages');
    const pages = Math.ceil(totalCopies / perPage);
    if (calcPages) {
        const summaryChk = document.getElementById('chkPrintSummaryPage');
        const hasSummary = summaryChk ? summaryChk.checked : true;
        let sumPages = 0;
        if (hasSummary) {
            try {
                const sData = getDeckSummaryData(currentLang);
                sumPages = sData.factions.length > 6 ? (Math.ceil((sData.factions.length - 6) / 8) + 1) : 1;
            } catch (e) {
                sumPages = 1;
            }
        }
        const baseText = typeof tp.sheetsSuffix === 'function'
            ? tp.sheetsSuffix(pages, perPage)
            : (currentLang === 'fr'
                ? `${pages} feuille${pages === 1 ? '' : 's'} A4 (${perPage} par feuille)`
                : (currentLang === 'en'
                    ? `${pages} A4 sheet${pages === 1 ? '' : 's'} (${perPage} per sheet)`
                    : `${pages} hoja${pages === 1 ? '' : 's'} A4 (${perPage} por hoja)`));
        const summarySuffix = sumPages > 0
            ? (currentLang === 'fr'
                ? (sumPages > 1 ? ` (+${sumPages} pages résumé)` : ' (+1 page résumé)')
                : (currentLang === 'en'
                    ? (sumPages > 1 ? ` (+${sumPages} summary sheets)` : ' (+1 summary cover)')
                    : (sumPages > 1 ? ` (+${sumPages} hojas resumen)` : ' (+1 portada resumen)')))
            : '';
        calcPages.textContent = baseText + summarySuffix;
    }

    const dimLabel = document.getElementById('printCalcDimensionsLabel');
    const dimDesc = document.getElementById('printCalcDimensionsDesc');
    if (dimDesc) {
        if (isStrips) {
            if (dimLabel) dimLabel.textContent = tp.specsLabel || (currentLang === 'fr' ? 'Format bandes / inserts :' : (currentLang === 'en' ? 'Strips / Inserts specs:' : 'Formato tiras / inserts:'));
            dimDesc.innerHTML = tp.specsStrips || (currentLang === 'fr' ? '63,5 × 27,5 mm &bull; 27 bandes par feuille A4 (3 × 9) &bull; Économie d\'encre' : (currentLang === 'en' ? '63.5 × 27.5 mm &bull; 27 strips per A4 sheet (3 × 9) &bull; Ink saving' : '63.5 × 27.5 mm &bull; 27 tiras por hoja A4 (3 × 9) &bull; Ahorro de tinta'));
        } else {
            const marginChk = document.getElementById('chkWhiteMargin');
            const marginNum = document.getElementById('numWhiteMargin');
            const hasMargin = marginChk ? marginChk.checked : true;
            const mVal = marginNum ? (parseFloat(marginNum.value) || 4) : 4;
            const marginTxt = hasMargin
                ? (currentLang === 'fr' ? `Marge blanche ${mVal} mm` : (currentLang === 'en' ? `${mVal} mm white border` : `Margen blanco ${mVal} mm`))
                : (currentLang === 'fr' ? 'Sans marge' : (currentLang === 'en' ? 'No border' : 'Sin margen blanco'));
            if (dimLabel) dimLabel.textContent = tp.specsLabel || (currentLang === 'fr' ? 'Spécifications :' : (currentLang === 'en' ? 'Specifications:' : 'Especificaciones:'));
            dimDesc.innerHTML = `63.5 × 88 mm &bull; ${marginTxt} &bull; ${currentLang === 'fr' ? 'Coins droits' : (currentLang === 'en' ? 'Straight corners' : 'Corte recto')} &bull; ${currentLang === 'fr' ? '9 cartes/feuille' : (currentLang === 'en' ? '9 cards/sheet' : '9 cartas por hoja')}`;
        }
    }

    const modalSubtitle = document.getElementById('printModalSubtitle');
    if (modalSubtitle) {
        if (isStrips) {
            modalSubtitle.innerHTML = tp.modalSubtitleStrips || (currentLang === 'fr' ? 'Format bandes pour pochettes · 63,5 × 27,5 mm · 27 bandes par feuille A4 (3 × 9)' : (currentLang === 'en' ? 'Sleeve insert strips · 63.5 × 27.5 mm · 27 strips per A4 page (3 × 9)' : 'Formato tiras para fundas · 63.5 × 27.5 mm · 27 tiras por hoja A4 (3 × 9)'));
        } else {
            const marginChk = document.getElementById('chkWhiteMargin');
            const marginNum = document.getElementById('numWhiteMargin');
            const hasMargin = marginChk ? marginChk.checked : true;
            const mVal = marginNum ? (parseFloat(marginNum.value) || 4) : 4;
            const marginTxt = hasMargin ? `${mVal} mm` : '0 mm';
            modalSubtitle.innerHTML = `Formato oficial A4 · 63.5 × 88 mm · Margen blanco ${marginTxt} · 9 cartas por hoja`;
        }
    }

    const btnPdf = document.getElementById('btnDownloadPDF');
    if (btnPdf && !btnPdf.disabled) {
        const pdfLabel = isStrips
            ? (tp.btnDownloadPDFStrips || 'PDF tiras (27/hoja)')
            : (tp.btnDownloadPDFStandard || 'Plantilla PDF');
        btnPdf.innerHTML = `<span id="txtBtnDownloadPDF">${pdfLabel}</span>`;
    }

    const whiteMarginGroup = document.getElementById('chkWhiteMargin')?.closest('.form-group');
    if (whiteMarginGroup) {
        whiteMarginGroup.style.display = isStrips ? 'none' : 'block';
    }

    const quickFilt = document.getElementById('quickFilteredCount');
    if (quickFilt) quickFilt.textContent = visibleCardIds.length;

    const listCountLabel = document.getElementById('printListCountLabel');
    if (listCountLabel) listCountLabel.textContent = uniqueCount;

    renderPrintFactionChips();
}

function toggleCardSelectForPrint(cardId, event) {
    if (event) event.stopPropagation();
    const card = cardsData.find(c => c.id === cardId);
    const defCopies = card ? (card.default_copies || 1) : 1;

    if (printQuantities.has(cardId)) {
        printQuantities.delete(cardId);
        showToast(`Carta #${cardId} retirada de la lista de impresión`);
    } else {
        printQuantities.set(cardId, defCopies);
        showToast(`Carta #${cardId} añadida (${defCopies} copia${defCopies > 1 ? 's' : ''})`);
    }

    updatePrintBadge();
    renderCards();
    const printModal = document.getElementById('printModal');
    if (printModal && printModal.style.display === 'flex') {
        renderPrintPreview(previewCurrentPage);
        if (isCardListOpen) renderCardQuantityList();
    }
}

function selectAllCardsForPrint() {
    cardsData.forEach(c => {
        printQuantities.set(c.id, c.default_copies || 1);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(0);
    if (isCardListOpen) renderCardQuantityList();
    showToast(`${cardsData.length} cartas seleccionadas con sus copias oficiales (${getTotalPrintCopies()} copias en total)`);
}

function selectFilteredCardsForPrint() {
    visibleCardIds.forEach(id => {
        const card = cardsData.find(c => c.id === id);
        printQuantities.set(id, card ? (card.default_copies || 1) : 1);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(0);
    if (isCardListOpen) renderCardQuantityList();
    showToast(`${visibleCardIds.length} cartas filtradas añadidas`);
}

function selectC1CardsForPrint() {
    const isPokemonPack = cardsData.some(c => c.game === 'pokemon') || currentPackCollection === 'Edición Pokémon';
    if (isPokemonPack) {
        const pokeCards = cardsData.filter(c => c.game === 'pokemon' || c.collection === 'Edición Pokémon');
        const targetCards = pokeCards.length > 0 ? pokeCards : cardsData;
        targetCards.forEach(c => {
            printQuantities.set(c.id, c.default_copies || 1);
        });
        updatePrintBadge();
        renderCards();
        renderPrintPreview(0);
        if (isCardListOpen) renderCardQuantityList();
        showToast(`${targetCards.length} cartas de Edición Pokémon seleccionadas con sus copias del mazo`);
        return;
    }
    const c1Cards = cardsData.filter(c => c.game === 'c1' || c.game === 'both' || c.game?.includes('1'));
    c1Cards.forEach(c => {
        printQuantities.set(c.id, c.default_copies || 1);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(0);
    if (isCardListOpen) renderCardQuantityList();
    showToast(`${c1Cards.length} cartas de Challengers! 1 seleccionadas con sus copias del mazo`);
}

function selectC2CardsForPrint() {
    const c2Cards = cardsData.filter(c => c.game === 'c2' || c.game === 'both' || c.game?.includes('Beach Cup'));
    c2Cards.forEach(c => {
        printQuantities.set(c.id, c.default_copies || 1);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(0);
    if (isCardListOpen) renderCardQuantityList();
    showToast(`${c2Cards.length} cartas de Beach Cup seleccionadas con sus copias del mazo`);
}

function deselectAllCardsForPrint() {
    printQuantities.clear();
    updatePrintBadge();
    renderCards();
    renderPrintPreview(0);
    if (isCardListOpen) renderCardQuantityList();
    showToast('Se han deseleccionado todas las cartas');
}

// Preset Quantity Helpers
/**
 * Aplica el preset de copias reglamentarias oficiales según las reglas del juego Challengers!.
 */
function applyPresetOfficialDeck() {
    if (printQuantities.size === 0) return;
    printQuantities.forEach((_, id) => {
        const card = cardsData.find(c => c.id === id);
        printQuantities.set(id, card ? (card.default_copies || 4) : 4);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(previewCurrentPage);
    if (isCardListOpen) renderCardQuantityList();
    showToast(`Restablecidas las copias originales del mazo para todas las seleccionadas`);
}

/**
 * Asigna exactamente 1 copia física a cada carta seleccionada para impresión.
 */
function applyPresetSingleCopy() {
    if (printQuantities.size === 0) return;
    printQuantities.forEach((_, id) => {
        printQuantities.set(id, 1);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(previewCurrentPage);
    if (isCardListOpen) renderCardQuantityList();
    showToast(`Todas las cartas seleccionadas fijadas a 1 copia exacta`);
}

/**
 * Incrementa en 1 la cantidad de copias a imprimir de todas las cartas seleccionadas.
 */
function applyPresetAddOne() {
    if (printQuantities.size === 0) return;
    printQuantities.forEach((qty, id) => {
        printQuantities.set(id, qty + 1);
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(previewCurrentPage);
    if (isCardListOpen) renderCardQuantityList();
}

/**
 * Reduce en 1 la cantidad de copias a imprimir de todas las cartas seleccionadas (mínimo 0).
 */
function applyPresetSubOne() {
    if (printQuantities.size === 0) return;
    printQuantities.forEach((qty, id) => {
        printQuantities.set(id, Math.max(1, qty - 1));
    });
    updatePrintBadge();
    renderCards();
    renderPrintPreview(previewCurrentPage);
    if (isCardListOpen) renderCardQuantityList();
}

// Switch between print modal tabs (Selection vs Format)
/**
 * Conmuta entre las pestañas del modal de impresión:
 * - 'printTabSelection': Selección de cartas y ajuste de copias.
 * - 'printTabFormat': Configuración de formato de salida, sangrado, encuadre y guías de corte.
 * 
 * @param {string} tabId - Identificador de la pestaña a activar.
 */
function switchPrintTab(tabId) {
    const btnSelection = document.getElementById('printTabBtnSelection');
    const btnFormat = document.getElementById('printTabBtnFormat');
    const paneSelection = document.getElementById('printTabPaneSelection');
    const paneFormat = document.getElementById('printTabPaneFormat');

    if (tabId === 'selection') {
        if (btnSelection) {
            btnSelection.classList.add('active');
            btnSelection.setAttribute('aria-selected', 'true');
        }
        if (btnFormat) {
            btnFormat.classList.remove('active');
            btnFormat.setAttribute('aria-selected', 'false');
        }
        if (paneSelection) {
            paneSelection.classList.add('active');
            paneSelection.style.display = 'flex';
        }
        if (paneFormat) {
            paneFormat.classList.remove('active');
            paneFormat.style.display = 'none';
        }
    } else {
        if (btnFormat) {
            btnFormat.classList.add('active');
            btnFormat.setAttribute('aria-selected', 'true');
        }
        if (btnSelection) {
            btnSelection.classList.remove('active');
            btnSelection.setAttribute('aria-selected', 'false');
        }
        if (paneFormat) {
            paneFormat.classList.add('active');
            paneFormat.style.display = 'flex';
        }
        if (paneSelection) {
            paneSelection.classList.remove('active');
            paneSelection.style.display = 'none';
        }
    }
}

// Get all dynamic active factions present in the current pack / cardsData
function getActivePrintFactions() {
    const factions = [];
    const addedIds = new Set();
    const t = i18n[currentLang] || i18n.es;
    const tabNames = t.factionTabNames || {};

    // 1. Starter cards (Level S)
    const starterCards = cardsData.filter(c => (c.level === 'S' || c.is_starter_card) && c.set_id !== 'robot');
    if (starterCards.length > 0) {
        factions.push({
            id: 'starter',
            name: tabNames['starter'] || 'Mazos de Inicio',
            color: '#2563eb',
            filterFn: (c) => (c.level === 'S' || c.is_starter_card) && c.set_id !== 'robot',
            cards: starterCards
        });
        addedIds.add('starter');
    }

    // 2. Robot / Rival cards (Level R, SOLO, or set_id === 'robot')
    const robotCards = cardsData.filter(c => c.set_id === 'robot' || c.level === 'R' || c.level === 'SOLO');
    if (robotCards.length > 0) {
        const robotSet = setsData['robot'] || {};
        const robotName = robotSet.name?.[currentLang] || robotSet.name?.es || tabNames['robot'] || 'Mazo de Robot';
        factions.push({
            id: 'robot',
            name: robotName,
            color: robotSet.color_hex || '#64748b',
            filterFn: (c) => c.set_id === 'robot' || c.level === 'R' || c.level === 'SOLO',
            cards: robotCards
        });
        addedIds.add('robot');
    }

    // 3. All other sets present in current cardsData
    const orderedTabIds = FACTION_TABS.filter(t => t.id !== 'all' && t.id !== 'starter' && t.id !== 'robot').map(t => t.id);
    const allSetIdsInSetsData = Object.keys(setsData).filter(sid => !addedIds.has(sid));
    const candidateSetIds = [...new Set([...orderedTabIds, ...allSetIdsInSetsData])];

    candidateSetIds.forEach(setId => {
        const setCards = cardsData.filter(c => c.set_id === setId && c.level !== 'S' && c.level !== 'R' && c.level !== 'SOLO');
        if (setCards.length === 0) return;

        const setInfo = setsData[setId] || {};
        const tabDef = FACTION_TABS.find(t => t.id === setId);

        const name = setInfo.name?.[currentLang]
            || setInfo.name?.es
            || (tabDef && tabNames[tabDef.nameKey])
            || tabDef?.defaultName
            || setId;

        const color = setInfo.color_hex || tabDef?.color || '#3b82f6';

        factions.push({
            id: setId,
            name: name,
            color: color,
            filterFn: (c) => c.set_id === setId && c.level !== 'S' && c.level !== 'R' && c.level !== 'SOLO',
            cards: setCards
        });
        addedIds.add(setId);
    });

    return factions;
}

// Render Faction Multi-Select Chips in Print Modal (Clean, no broken/hardcoded images)
function renderPrintFactionChips() {
    const container = document.getElementById('printFactionChipsGrid');
    if (!container) return;
    container.innerHTML = '';

    const activeFactions = getActivePrintFactions();

    activeFactions.forEach(faction => {
        const totalInTab = faction.cards.length;
        const selectedInTab = faction.cards.filter(c => printQuantities.has(c.id)).length;
        const isSelected = selectedInTab === totalInTab && totalInTab > 0;
        const isPartial = selectedInTab > 0 && selectedInTab < totalInTab;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'print-faction-chip' + (isSelected ? ' is-selected' : (isPartial ? ' is-partial' : ''));
        chip.dataset.tabId = faction.id;
        chip.title = `Hacer clic para ${isSelected ? 'deseleccionar' : 'seleccionar'} cartas de esta facción`;

        chip.innerHTML = `
      <span class="print-faction-chip-left">
        <span class="print-faction-chip-dot" style="background: ${faction.color};"></span>
        <span class="print-faction-chip-name">${faction.name}</span>
      </span>
      <span class="print-faction-chip-count">${selectedInTab}/${totalInTab}</span>
    `;

        chip.addEventListener('click', () => {
            toggleFactionForPrint(faction);
        });

        container.appendChild(chip);
    });
}

// Toggle selection of all cards of a given faction
function toggleFactionForPrint(faction) {
    const tabCards = faction.cards;
    if (!tabCards || tabCards.length === 0) return;

    const totalInTab = tabCards.length;
    const selectedInTab = tabCards.filter(c => printQuantities.has(c.id)).length;
    const allSelected = selectedInTab === totalInTab;

    if (allSelected) {
        tabCards.forEach(c => printQuantities.delete(c.id));
        showToast(`Facción ${faction.name} deseleccionada`);
    } else {
        tabCards.forEach(c => {
            printQuantities.set(c.id, c.default_copies || 1);
        });
        showToast(`Facción ${faction.name} seleccionada (${totalInTab} cartas)`);
    }

    updatePrintBadge();
    renderCards();
    renderPrintPreview(previewCurrentPage);
    renderPrintFactionChips();
    if (isCardListOpen) {
        populatePrintListFactionFilter();
        renderCardQuantityList();
    }
}

// Populate the Breakdown List Faction Filter Dropdown
function populatePrintListFactionFilter() {
    const select = document.getElementById('printListFactionFilter');
    if (!select) return;

    const prevVal = select.value || 'all';
    select.innerHTML = '<option value="all">Todas las facciones</option>';

    const activeFactions = getActivePrintFactions();
    activeFactions.forEach(faction => {
        const opt = document.createElement('option');
        opt.value = faction.id;
        opt.textContent = faction.name;
        select.appendChild(opt);
    });

    if (select.querySelector(`option[value="${prevVal}"]`)) {
        select.value = prevVal;
    } else {
        select.value = 'all';
    }
}

// Collapsible Card Quantity List Management
function toggleCardQuantityList() {
    const wrapperEl = document.getElementById('printCardsListWrapper');
    const arrowEl = document.getElementById('txtListToggleArrow');
    isCardListOpen = !isCardListOpen;
    if (wrapperEl) wrapperEl.style.display = isCardListOpen ? 'block' : 'none';
    if (arrowEl) arrowEl.textContent = isCardListOpen ? '▲' : '▼';
    if (isCardListOpen) {
        populatePrintListFactionFilter();
        renderCardQuantityList();
    }
}

function renderCardQuantityList() {
    const listEl = document.getElementById('printCardsList');
    const filteredCountEl = document.getElementById('printListFilteredCount');
    const factionSelect = document.getElementById('printListFactionFilter');
    if (!listEl) return;
    listEl.innerHTML = '';

    const t = i18n[currentLang] || i18n.es;
    const tp = t.print || {};
    const selectedFaction = factionSelect ? factionSelect.value : 'all';

    if (printQuantities.size === 0) {
        listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 0.75rem;">${tp.noCardsSelected || (currentLang === 'fr' ? 'Aucune carte sélectionnée' : (currentLang === 'en' ? 'No cards selected' : 'No hay cartas seleccionadas'))}</div>`;
        if (filteredCountEl) filteredCountEl.textContent = `0 ${currentLang === 'fr' ? 'cartes' : (currentLang === 'en' ? 'cards' : 'cartas')}`;
        return;
    }

    let sortedCards = Array.from(printQuantities.keys())
        .map(id => cardsData.find(c => c.id === id))
        .filter(Boolean)
        .sort((a, b) => a.id - b.id);

    if (selectedFaction && selectedFaction !== 'all') {
        const activeFactions = getActivePrintFactions();
        const targetFaction = activeFactions.find(f => f.id === selectedFaction);
        if (targetFaction && targetFaction.filterFn) {
            sortedCards = sortedCards.filter(targetFaction.filterFn);
        }
    }

    if (filteredCountEl) {
        filteredCountEl.textContent = `${sortedCards.length} ${currentLang === 'fr' ? 'cartes' : (currentLang === 'en' ? 'cards' : (sortedCards.length === 1 ? 'carta' : 'cartas'))}`;
    }

    if (sortedCards.length === 0) {
        listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 0.75rem;">${tp.noCardsForFaction || (currentLang === 'fr' ? 'Aucune carte sélectionnée pour cette faction' : (currentLang === 'en' ? 'No cards selected for this faction' : 'No hay cartas seleccionadas para esta facción'))}</div>`;
        return;
    }

    sortedCards.forEach(card => {
        const qty = printQuantities.get(card.id) || 1;
        const cData = card[currentLang] || card['en'] || card['es'] || {};
        const defHint = card.default_copies ? `(${currentLang === 'fr' ? 'Deck' : (currentLang === 'en' ? 'Deck' : 'Mazo')}: ${card.default_copies}x)` : '';

        const row = document.createElement('div');
        row.className = 'card-qty-row';
        const thumbSrc = getArtImagePath(card.art_image || card.art_path);
        const cleanCardName = (cData.name || '').replace(/"/g, '&quot;');
        const setObj = setsData[card.set_id] || {};
        const setName = setObj.name?.[currentLang] || setObj.name?.es || '';
        const setColor = setObj.color_hex || '#0284c7';

        row.innerHTML = `
      <div class="card-qty-info">
        <div class="card-qty-thumb-wrap" data-card-id="${card.id}" data-card-name="${cleanCardName}" data-thumb-src="${thumbSrc}" data-set-name="${setName}" data-set-color="${setColor}">
          <img class="card-qty-thumb" src="${thumbSrc}" alt="${cleanCardName}" loading="lazy">
        </div>
        <div>
          <span class="card-qty-name">#${card.id} ${cData.name || ''}</span>
          <span class="card-qty-default-hint">${defHint}</span>
        </div>
      </div>
      <div class="card-qty-controls">
        <button type="button" class="btn-qty-step" onclick="stepCardQty(${card.id}, -1)">-</button>
        <input type="number" class="card-qty-input" min="1" max="50" value="${qty}" onchange="setCardQty(${card.id}, this.value)">
        <button type="button" class="btn-qty-step" onclick="stepCardQty(${card.id}, 1)">+</button>
        <button type="button" class="btn-qty-delete" title="${currentLang === 'fr' ? 'Retirer la carte' : (currentLang === 'en' ? 'Remove card' : 'Quitar carta')}" onclick="removeCardFromPrint(${card.id})">✕</button>
      </div>
    `;
        listEl.appendChild(row);

        const thumbWrap = row.querySelector('.card-qty-thumb-wrap');
        if (thumbWrap) {
            thumbWrap.addEventListener('mouseenter', () => showThumbHoverPreview(thumbWrap));
            thumbWrap.addEventListener('mouseleave', () => hideThumbHoverPreview());
        }
    });
}

function showThumbHoverPreview(wrap) {
    if (!wrap) return;
    let previewEl = document.getElementById('printThumbHoverPreview');
    if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.id = 'printThumbHoverPreview';
        previewEl.className = 'card-thumb-hover-preview';
        document.body.appendChild(previewEl);
    }

    const thumbSrc = wrap.dataset.thumbSrc;
    const cardName = wrap.dataset.cardName || '';
    const cardId = wrap.dataset.cardId || '';
    const setName = wrap.dataset.setName || '';
    const setColor = wrap.dataset.setColor || '#0284c7';

    previewEl.innerHTML = `
    <div class="hover-preview-card">
      <div class="hover-preview-img-box">
        <img src="${thumbSrc}" alt="${cardName}">
      </div>
      <div class="hover-preview-info">
        <span class="hover-preview-title">#${cardId} ${cardName}</span>
        ${setName ? `<span class="hover-preview-tag" style="background: ${setColor}18; color: ${setColor}; border: 1px solid ${setColor}40;">${setName}</span>` : ''}
      </div>
    </div>
  `;

    previewEl.style.display = 'block';

    const rect = wrap.getBoundingClientRect();
    const previewWidth = 158;
    const previewHeight = 220;

    let left = rect.right + 12;
    if (left + previewWidth > window.innerWidth - 10) {
        left = Math.max(10, rect.left - previewWidth - 12);
    }

    let top = rect.top - 30;
    if (top + previewHeight > window.innerHeight - 10) {
        top = window.innerHeight - previewHeight - 10;
    }
    if (top < 10) top = 10;

    previewEl.style.top = `${top}px`;
    previewEl.style.left = `${left}px`;
}

function hideThumbHoverPreview() {
    const previewEl = document.getElementById('printThumbHoverPreview');
    if (previewEl) {
        previewEl.style.display = 'none';
    }
}

function stepCardQty(cardId, delta) {
    const current = printQuantities.get(cardId) || 1;
    const next = Math.max(1, current + delta);
    printQuantities.set(cardId, next);
    updatePrintBadge();
    renderCards();
    renderCardQuantityList();
    renderPrintPreview(previewCurrentPage);
}

function setCardQty(cardId, val) {
    const parsed = parseInt(val, 10);
    const next = isNaN(parsed) || parsed < 1 ? 1 : parsed;
    printQuantities.set(cardId, next);
    updatePrintBadge();
    renderCards();
    renderCardQuantityList();
    renderPrintPreview(previewCurrentPage);
}

function removeCardFromPrint(cardId) {
    hideThumbHoverPreview();
    printQuantities.delete(cardId);
    updatePrintBadge();
    renderCards();
    renderCardQuantityList();
    renderPrintPreview(previewCurrentPage);
}

// Modal Open / Close
/**
 * Abre y prepara el modal de impresión y exportación, actualizando estadísticas y vista previa.
 */
function openPrintModal() {
    const hasC1Cards = cardsData.some(c => c.game === 'c1');
    const hasC2Cards = cardsData.some(c => c.game === 'c2');
    const isOriginalChallengersGame = hasC1Cards && hasC2Cards;
    const btnC1 = document.getElementById('btnSelectC1Cards');
    const btnC2 = document.getElementById('btnSelectC2Cards');
    if (btnC1 && btnC2) {
        if (isOriginalChallengersGame) {
            btnC1.textContent = 'Challengers 1';
            btnC1.style.display = '';
            btnC2.textContent = 'Beach Cup';
            btnC2.style.display = '';
        } else {
            btnC1.style.display = 'none';
            btnC2.style.display = 'none';
        }
    }

    if (printQuantities.size === 0) {
        if (visibleCardIds.length > 0 && visibleCardIds.length <= 18) {
            visibleCardIds.forEach(id => {
                const card = cardsData.find(c => c.id === id);
                printQuantities.set(id, card ? (card.default_copies || 1) : 1);
            });
        } else {
            visibleCardIds.slice(0, 9).forEach(id => {
                const card = cardsData.find(c => c.id === id);
                printQuantities.set(id, card ? (card.default_copies || 1) : 1);
            });
        }
        renderCards();
    }

    updatePrintBadge();
    previewCurrentPage = 0;
    renderPrintPreview(0);
    renderPrintFactionChips();
    switchPrintTab('selection');
    if (isCardListOpen) {
        populatePrintListFactionFilter();
        renderCardQuantityList();
    }

    const langSelect = document.getElementById('selectPrintLang');
    if (langSelect && (!langSelect.value || langSelect.value === '')) {
        langSelect.value = currentLang;
    }
    const fitSelect = document.getElementById('selectPrintArtFit');
    if (fitSelect && !fitSelect.value) {
        fitSelect.value = 'cover';
    }
    const marginNum = document.getElementById('numWhiteMargin');
    if (marginNum && !marginNum.value) {
        marginNum.value = '4';
    }

    const modal = document.getElementById('printModal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

/**
 * Cierra el modal de exportación e impresión.
 */
function closePrintModal() {
    hideThumbHoverPreview();
    const modal = document.getElementById('printModal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    const printArea = document.getElementById('printArea');
    if (printArea) printArea.innerHTML = '';
}

function showPrevPreviewPage() {
    if (previewCurrentPage > 0) {
        previewCurrentPage--;
        renderPrintPreview(previewCurrentPage);
    }
}

function showNextPreviewPage() {
    const expanded = getExpandedPrintCards();
    const { mode } = getPrintOptions();
    const perPage = (mode === 'strips') ? 30 : 9;
    const totalPages = Math.max(1, Math.ceil(expanded.length / perPage));
    if (previewCurrentPage < totalPages - 1) {
        previewCurrentPage++;
        renderPrintPreview(previewCurrentPage);
    }
}

/**
 * Extrae y valida todas las opciones de configuración seleccionadas en el modal de impresión:
 * idioma, modo de maquetación, sangrado, guías de corte, ajuste de arte y portada.
 * 
 * @returns {{lang: string, mode: string, whiteMargin: boolean, marginMm: number, cutType: string, artFit: string, artScale: number, includeSummary: boolean}}
 */
function getPrintOptions() {
    const langSelect = document.getElementById('selectPrintLang');
    const modeRadio = document.querySelector('input[name="printMode"]:checked');
    const cutTypeRadio = document.querySelector('input[name="printCutType"]:checked');
    const marginChk = document.getElementById('chkWhiteMargin');
    const marginNum = document.getElementById('numWhiteMargin');
    const summaryChk = document.getElementById('chkPrintSummaryPage');
    const fitSelect = document.getElementById('selectPrintArtFit');
    const scaleInput = document.getElementById('rangePrintArtScale');

    const cutType = cutTypeRadio ? cutTypeRadio.value : 'crosses';
    const marginVal = marginNum ? Math.max(0.5, parseFloat(marginNum.value) || 4) : 4;

    return {
        lang: langSelect ? langSelect.value : currentLang,
        mode: modeRadio ? modeRadio.value : 'template',
        cutType: cutType,
        cutMarks: cutType !== 'none',
        whiteMargin: marginChk ? marginChk.checked : true,
        marginMm: marginVal,
        includeSummary: summaryChk ? summaryChk.checked : true,
        artFit: fitSelect ? fitSelect.value : 'cover',
        artScale: scaleInput ? (parseInt(scaleInput.value, 10) || 100) : 100
    };
}

/**
 * Genera una lista plana de cartas replicadas según su conteo de copias en printQuantities.
 * 
 * @returns {Array<Card>} Array con una entrada por cada carta física individual a imprimir.
 */
function getExpandedPrintCards() {
    const expanded = [];
    const sortedIds = Array.from(printQuantities.keys()).sort((a, b) => a - b);
    sortedIds.forEach(id => {
        const card = cardsData.find(c => c.id === id);
        const qty = printQuantities.get(id) || 1;
        if (card) {
            for (let i = 0; i < qty; i++) {
                expanded.push(card);
            }
        }
    });
    return expanded;
}

/**
 * Genera y actualiza la vista previa en vivo de la hoja A4 en el visor lateral del modal de impresión.
 * 
 * @param {number} [pageIndex=0] - Índice de la página de cartas a visualizar.
 */
function renderPrintPreview(pageIndex = 0) {
    const sheet = document.getElementById('sheetPreviewA4');
    if (!sheet) return;
    sheet.innerHTML = '';

    const { lang, mode, whiteMargin, marginMm, cutType, artFit, artScale } = getPrintOptions();
    const isStrips = (mode === 'strips');
    const perPage = isStrips ? 27 : 9;
    const expandedCards = getExpandedPrintCards();
    const totalPages = Math.max(1, Math.ceil(expandedCards.length / perPage));

    if (pageIndex >= totalPages) pageIndex = totalPages - 1;
    if (pageIndex < 0) pageIndex = 0;
    previewCurrentPage = pageIndex;

    const t = i18n[currentLang] || i18n.es;
    const tp = t.print || {};
    document.getElementById('txtPreviewPage').textContent = typeof tp.pageOf === 'function'
        ? tp.pageOf(pageIndex + 1, totalPages)
        : (currentLang === 'fr'
            ? `Page ${pageIndex + 1} sur ${totalPages}`
            : (currentLang === 'en'
                ? `Page ${pageIndex + 1} of ${totalPages}`
                : `Página ${pageIndex + 1} de ${totalPages}`));
    document.getElementById('btnPrevPage').disabled = (pageIndex === 0);
    document.getElementById('btnNextPage').disabled = (pageIndex >= totalPages - 1);

    sheet.classList.toggle('is-strips-preview', isStrips);
    sheet.classList.remove('has-cross-marks', 'has-grid-marks', 'has-no-marks');
    if (cutType === 'grid') {
        sheet.classList.add('has-grid-marks');
    } else if (cutType === 'crosses') {
        sheet.classList.add('has-cross-marks');
    } else {
        sheet.classList.add('has-no-marks');
    }

    const sampleBox = document.getElementById('stripSamplePreview');
    const sampleCardEl = document.getElementById('stripSampleCard');
    const sampleTitleEl = document.getElementById('stripSampleCardTitle');

    const startIdx = pageIndex * perPage;
    const pageCards = expandedCards.slice(startIdx, startIdx + perPage);

    const scaleStyle = (artScale && Number(artScale) !== 100)
        ? `transform: scale(${Number(artScale) / 100}); transform-origin: center center;`
        : '';

    if (isStrips) {
        if (sampleBox && sampleCardEl) {
            const sampleCard = pageCards.find(Boolean) || expandedCards[0];
            if (sampleCard) {
                sampleBox.style.display = 'block';
                const cd = sampleCard[lang] || sampleCard['en'] || sampleCard['es'] || {};
                if (sampleTitleEl) sampleTitleEl.textContent = `#${sampleCard.id} ${cd.name || ''}`;
                sampleCardEl.innerHTML = createCardStripHTML(sampleCard, lang, false);
            } else {
                sampleBox.style.display = 'none';
            }
        }

        for (let i = 0; i < 27; i++) {
            const card = pageCards[i];
            const cell = document.createElement('div');
            cell.className = 'mini-preview-strip' + (!card ? ' empty-slot' : '');

            if (card) {
                const cData = card[lang] || card['en'] || card['es'] || {};
                const setInfo = setsData[card.set_id] || {};
                const colorHex = setInfo.color_hex || '#38bdf8';
                const isTrainer = String(card.level).includes('Entraîn') || String(card.level).includes('Train');
                const displayLvl = isTrainer ? '∞' : (card.level || 'A');

                cell.innerHTML = `
          <div class="mini-strip-header" style="border-left: 2px solid ${colorHex};">
            <span style="font-weight: 800;">${card.strength || '?'}</span>
            <span class="mini-strip-name">${cData.name || ''}</span>
            <span style="font-weight: 800; color: #475569;">${displayLvl}</span>
          </div>
          <div class="mini-strip-body">
            ${cData.text || '—'}
          </div>
        `;

                cell.style.cursor = 'pointer';
                cell.title = `Pasar ratón o tocar para ver "${cData.name}" en grande`;
                cell.addEventListener('mouseenter', () => {
                    if (sampleCardEl && sampleTitleEl) {
                        sampleTitleEl.textContent = `#${card.id} ${cData.name || ''}`;
                        sampleCardEl.innerHTML = createCardStripHTML(card, lang, false);
                    }
                });
            } else {
                cell.innerHTML = `<span style="font-size: 5px; color: #94a3b8; display: flex; align-items: center; justify-content: center; height: 100%;">Vacío</span>`;
            }
            sheet.appendChild(cell);
        }
    } else {
        if (sampleBox) sampleBox.style.display = 'none';

        for (let i = 0; i < 9; i++) {
            const card = pageCards[i];
            const cell = document.createElement('div');
            const marginClass = whiteMargin ? '' : ' no-white-margin';
            cell.className = 'mini-preview-card is-print-square' + marginClass + (!card ? ' empty-slot' : '');
            if (whiteMargin) {
                const previewPad = Math.max(1, Math.round((marginMm || 4) * 0.45));
                cell.style.padding = `${previewPad}px`;
            } else {
                cell.style.padding = '0px';
            }

            if (card) {
                const cData = card[lang] || card['en'] || card['es'] || {};
                const setInfo = setsData[card.set_id] || {};
                const colorHex = setInfo.color_hex || '#38bdf8';
                const textColor = setInfo.color_border || (typeof colorHex === 'string' && colorHex.startsWith('#') ? colorHex : '#8b5cf6');

                if (mode === 'bga') {
                    const bgaSrc = getCardImagePath(card.card_image || card.digital_card_path || card.card_path);
                    cell.innerHTML = `
            <div class="mini-card-art" style="height: 100%;">
              <img class="${normalizeArtFitClass(artFit)}" style="${scaleStyle}" src="${bgaSrc}" alt="${cData.name || ''}">
            </div>
          `;
                } else {
                    const artSrc = getArtImagePath(card.art_image || card.art_path);
                    cell.innerHTML = `
            <div class="mini-card-header" style="background: ${colorHex}; color: #fff;">
              <span>${card.strength}</span>
              <span style="font-size: 4px; text-transform: uppercase;">${cData.name || ''}</span>
              <span>${card.strength}</span>
            </div>
            <div class="mini-card-art">
              <img class="${normalizeArtFitClass(artFit)}" style="${scaleStyle}" src="${artSrc}" alt="${cData.name || ''}">
            </div>
            <div class="mini-card-bottom">
              <span style="font-size: 3.5px; color: #334155; max-width: 80%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                ${cData.text || ''}
              </span>
              <span style="font-weight: 800; color: ${textColor};">${card.level}</span>
            </div>
          `;
                }
            } else {
                cell.innerHTML = `<span style="font-size: 7px; color: #94a3b8; display: flex; align-items: center; justify-content: center; height: 100%;">Vacío</span>`;
            }
            sheet.appendChild(cell);
        }
    }

    // Add preview sheet footer: deck name (left), web URL (center), page / total (right)
    const { deckName, webUrl, pageStr } = getPrintPageFooterData(pageIndex, totalPages, lang);
    const previewFooter = document.createElement('div');
    previewFooter.className = 'sheet-preview-footer';
    previewFooter.innerHTML = `
    <span class="preview-footer-deck">${deckName}</span>
    <span class="preview-footer-web">${webUrl}</span>
    <span class="preview-footer-page">${pageStr}</span>
  `;
    sheet.appendChild(previewFooter);

    updatePrintBadge();
}

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// Render strip to canvas with EXACT 63.5 x 27.5 mm aspect ratio and crisp resolution
async function renderStripToCanvas(card, lang) {
    const temp = document.createElement('div');
    temp.className = 'print-strip-render-temp is-print-square';
    // Position off-screen with full opacity so html2canvas renders completely
    temp.style.cssText = `
    position: fixed;
    top: 0;
    left: -9999px;
    width: 300px;
    height: 130px;
    background: #ffffff;
    box-sizing: border-box;
    z-index: -99999;
    opacity: 1;
    pointer-events: none;
    border-radius: 0 !important;
  `;
    temp.innerHTML = createCardStripHTML(card, lang, true);
    document.body.appendChild(temp);

    // Wait for images inside to load and decode
    const imgs = Array.from(temp.querySelectorAll('img'));
    await Promise.all(imgs.map(async img => {
        img.removeAttribute('loading');
        if (img.decode) {
            try {
                await img.decode();
            } catch (e) {
                if (!img.complete) {
                    await new Promise(res => {
                        img.onload = res;
                        img.onerror = res;
                        setTimeout(res, 500);
                    });
                }
            }
        } else if (!img.complete) {
            await new Promise(res => {
                img.onload = res;
                img.onerror = res;
                setTimeout(res, 500);
            });
        }
    }));

    const canvas = await html2canvas(temp, {
        scale: 2.2, // 300+ DPI sharp print quality
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
    });

    document.body.removeChild(temp);
    return canvas;
}

// Render card to canvas with SQUARE CORNERS (border-radius: 0) and authentic white margin
async function renderCardToCanvas(card, lang, whiteMargin = true, artFit = 'cover', artScale = 100, marginMm = 4) {
    const temp = document.createElement('div');
    temp.className = 'print-render-temp is-print-square';
    // Position off-screen with full opacity so html2canvas renders completely
    temp.style.cssText = `
    position: fixed;
    top: 0;
    left: -9999px;
    width: 300px;
    height: 415.75px;
    background: #ffffff;
    box-sizing: border-box;
    z-index: -99999;
    opacity: 1;
    pointer-events: none;
    border-radius: 0 !important;
  `;
    // Pass isPrintMode = true to enforce square corners, eager loading, whiteMargin, artFit, artScale, marginMm
    temp.innerHTML = createCardTemplateHTML(card, lang, true, whiteMargin, artFit, artScale, marginMm);
    document.body.appendChild(temp);

    // Wait for all images inside to load and decode properly
    const imgs = Array.from(temp.querySelectorAll('img'));
    await Promise.all(imgs.map(async img => {
        img.removeAttribute('loading');
        if (img.decode) {
            try {
                await img.decode();
            } catch (e) {
                if (!img.complete) {
                    await new Promise(res => {
                        img.onload = res;
                        img.onerror = res;
                        setTimeout(res, 600);
                    });
                }
            }
        } else if (!img.complete) {
            await new Promise(res => {
                img.onload = res;
                img.onerror = res;
                setTimeout(res, 600);
            });
        }
    }));

    // Replace artwork image with a mathematically exact canvas to guarantee ZERO distortion in html2canvas
    const artImg = temp.querySelector('.c-art-image, .c-photo-img');
    if (artImg && artImg.naturalWidth && artImg.naturalHeight) {
        const container = artImg.parentElement;
        const boxW = (container && container.clientWidth) ? container.clientWidth : 300;
        const boxH = (container && container.clientHeight) ? container.clientHeight : 240;
        const natW = artImg.naturalWidth;
        const natH = artImg.naturalHeight;
        const normFit = normalizeArtFit(artFit);
        const scaleFactor = (Number(artScale) || 100) / 100;

        let destW = boxW;
        let destH = boxH;

        if (normFit === 'fit-height') {
            const s = (boxH / natH) * scaleFactor;
            destW = natW * s;
            destH = natH * s;
        } else if (normFit === 'fit-width') {
            const s = (boxW / natW) * scaleFactor;
            destW = natW * s;
            destH = natH * s;
        } else if (normFit === 'cover') {
            const s = Math.max(boxW / natW, boxH / natH) * scaleFactor;
            destW = natW * s;
            destH = natH * s;
        } else { // contain
            const s = Math.min(boxW / natW, boxH / natH) * scaleFactor;
            destW = natW * s;
            destH = natH * s;
        }

        // High resolution canvas for sharp 300+ DPI rendering
        const dpr = 2.5;
        const artCanvas = document.createElement('canvas');
        artCanvas.width = Math.round(boxW * dpr);
        artCanvas.height = Math.round(boxH * dpr);
        artCanvas.style.width = `${boxW}px`;
        artCanvas.style.height = `${boxH}px`;
        artCanvas.style.display = 'block';
        artCanvas.style.position = 'absolute';
        artCanvas.style.top = '0';
        artCanvas.style.left = '0';
        artCanvas.style.zIndex = '1';

        const ctx = artCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, artCanvas.width, artCanvas.height);

        const drawW = destW * dpr;
        const drawH = destH * dpr;
        const drawX = (artCanvas.width - drawW) / 2;
        const drawY = (artCanvas.height - drawH) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(artImg, drawX, drawY, drawW, drawH);

        artImg.parentNode.replaceChild(artCanvas, artImg);
    }

    const canvas = await html2canvas(temp, {
        scale: 2.2, // 300+ DPI sharp print quality
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
    });

    document.body.removeChild(temp);
    return canvas;
}

// Draw precise guillotine crop marks on jsPDF document
function drawCropMarks(doc, marginX, marginY, cardW, cardH, cols, rows, cutType) {
    if (cutType === 'none') return;

    if (cutType === 'grid') {
        doc.setLineWidth(0.2);
        doc.setDrawColor(148, 163, 184);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = marginX + c * cardW;
                const y = marginY + r * cardH;
                doc.rect(x, y, cardW, cardH);
            }
        }
        return;
    }

    if (cutType === 'crosses') {
        const armIn = 2.5; // mm along card boundaries
        const marginTick = 4.0; // mm into outer margin
        doc.setLineWidth(0.2);
        doc.setDrawColor(80, 90, 105);

        for (let c = 0; c <= cols; c++) {
            for (let r = 0; r <= rows; r++) {
                const x = marginX + c * cardW;
                const y = marginY + r * cardH;

                // Horizontal segment
                const xLeft = (c === 0) ? Math.max(0, x - marginTick) : (x - armIn);
                const xRight = (c === cols) ? Math.min(210, x + marginTick) : (x + armIn);
                doc.line(xLeft, y, xRight, y);

                // Vertical segment
                const yTop = (r === 0) ? Math.max(0, y - marginTick) : (y - armIn);
                const yBottom = (r === rows) ? Math.min(297, y + marginTick) : (y + armIn);
                doc.line(x, yTop, x, yBottom);
            }
        }
    }
}

// Helper to construct sheet footer content (deck name left, web url center, page/total right)
function getPrintPageFooterData(pageIndex, totalPages, lang = 'es') {
    // 1. Deck Name
    let deckName = 'Challengers!';
    const rawName = (currentPackInfo && currentPackInfo.name ? currentPackInfo.name : '').toLowerCase();
    if (rawName.includes('dioses')) {
        deckName = 'Expansión Dioses';
    } else if (rawName.includes('pokemon')) {
        deckName = 'Edición Pokémon';
    } else if (rawName.includes('yokai')) {
        deckName = 'Expansión Yōkais';
    } else if (rawName.includes('challenger')) {
        deckName = 'Challengers! Original';
    } else if (currentPackInfo && currentPackInfo.name) {
        deckName = currentPackInfo.name.replace(/\.zip$/i, '').replace(/[_-]/g, ' ').trim();
        if (deckName) {
            deckName = deckName.replace(/\b\w/g, l => l.toUpperCase());
        } else {
            deckName = 'Challengers!';
        }
    }

    // 2. Web URL
    let webUrl = '';
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol.startsWith('http')) {
            webUrl = window.location.origin + window.location.pathname.replace(/\/index\.html$/i, '');
            if (!webUrl.endsWith('/')) webUrl += '/';
        } else {
            webUrl = 'challengers-cards';
        }
    }

    // 3. Page / total string
    let pagePrefix = 'Página';
    if (lang === 'fr' || lang === 'en') pagePrefix = 'Page';
    const pageStr = `${pagePrefix} ${pageIndex + 1} / ${totalPages}`;

    return { deckName, webUrl, pageStr };
}

// Download PDF with exact 63.5 x 88 mm cards OR 63.5 x 27.5 mm text strips
async function downloadPrintPDF() {
    const expandedCards = getExpandedPrintCards();
    if (expandedCards.length === 0) {
        alert('Por favor selecciona al menos una carta para generar el PDF.');
        return;
    }

    const { lang, mode, cutType, whiteMargin, marginMm, artFit, artScale, includeSummary } = getPrintOptions();
    const btn = document.getElementById('btnDownloadPDF');
    const btnImg = document.getElementById('btnDownloadImages');
    const btnPrint = document.getElementById('btnPrintDirect');
    if (btn) btn.disabled = true;
    if (btnImg) btnImg.disabled = true;
    if (btnPrint) btnPrint.disabled = true;

    const isStrips = (mode === 'strips');
    const perPage = isStrips ? 27 : 9;
    const cardW = 63.5;
    const cardH = isStrips ? 27.5 : 88.0;
    const cols = 3;
    const rows = isStrips ? 9 : 3;
    const marginX = (210 - cols * cardW) / 2; // 9.75 mm
    const marginY = (297 - rows * cardH) / 2; // 24.75 mm for strips, 16.5 mm for full cards
    const totalPages = Math.ceil(expandedCards.length / perPage);

    showZipProgress(true, `Iniciando generación de PDF (${expandedCards.length} ${isStrips ? 'tiras' : 'cartas'})...`, 5, 'Generando PDF para imprimir');

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4' // 210 x 297 mm
        });

        let summaryCanvases = [];
        if (includeSummary) {
            showZipProgress(true, 'Generando portada y resumen oficial del pack...', 8, 'Generando PDF para imprimir');
            try {
                summaryCanvases = await renderDeckSummaryToCanvases(lang);
                if (summaryCanvases && summaryCanvases.length > 0) {
                    for (let s = 0; s < summaryCanvases.length; s++) {
                        if (s > 0) {
                            doc.addPage('a4', 'portrait');
                        }
                        const summaryImg = summaryCanvases[s].toDataURL('image/jpeg', 0.95);
                        doc.addImage(summaryImg, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
                    }
                }
            } catch (errSummary) {
                console.warn('Error rendering deck summary pages for PDF:', errSummary);
            }
        }

        const canvasCache = new Map();

        for (let p = 0; p < totalPages; p++) {
            if (summaryCanvases.length > 0 || p > 0) {
                doc.addPage('a4', 'portrait');
            }

            const pageCards = expandedCards.slice(p * perPage, (p + 1) * perPage);

            for (let c = 0; c < pageCards.length; c++) {
                const card = pageCards[c];
                const cardIndexGlobal = p * perPage + c + 1;
                const col = c % cols;
                const row = Math.floor(c / cols);

                const x = marginX + col * cardW;
                const y = marginY + row * cardH;

                const pct = Math.min(95, Math.round((cardIndexGlobal / expandedCards.length) * 90) + 5);
                showZipProgress(true, `Procesando ${isStrips ? 'tira' : 'carta'} ${cardIndexGlobal} de ${expandedCards.length}...`, pct, 'Generando PDF para imprimir');

                if (isStrips) {
                    const cacheKey = `strip_${card.id}_${lang}`;
                    let imgData = canvasCache.get(cacheKey);
                    if (!imgData) {
                        const canvas = await renderStripToCanvas(card, lang);
                        if (canvas) {
                            imgData = canvas.toDataURL('image/jpeg', 0.95);
                            canvasCache.set(cacheKey, imgData);
                        }
                    }
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', x, y, cardW, cardH, undefined, 'FAST');
                    }
                } else if (mode === 'bga') {
                    const cacheKey = `${card.id}_bga_${artFit}_${artScale}`;
                    let imgData = canvasCache.get(cacheKey);
                    if (!imgData) {
                        const bgaSrc = getCardImagePath(card.card_image || card.digital_card_path || card.card_path);
                        const rawImg = await loadImage(bgaSrc);
                        if (rawImg) {
                            const bgaCanvas = document.createElement('canvas');
                            const bgaW = 750;
                            const bgaH = 1039;
                            bgaCanvas.width = bgaW;
                            bgaCanvas.height = bgaH;
                            const bgaCtx = bgaCanvas.getContext('2d');
                            bgaCtx.fillStyle = '#ffffff';
                            bgaCtx.fillRect(0, 0, bgaW, bgaH);

                            const natW = rawImg.naturalWidth || rawImg.width;
                            const natH = rawImg.naturalHeight || rawImg.height;
                            const scaleFactor = (Number(artScale) || 100) / 100;
                            const normFit = normalizeArtFit(artFit);

                            let destW = bgaW;
                            let destH = bgaH;
                            if (normFit === 'fit-height') {
                                const s = (bgaH / natH) * scaleFactor;
                                destW = natW * s;
                                destH = natH * s;
                            } else if (normFit === 'fit-width') {
                                const s = (bgaW / natW) * scaleFactor;
                                destW = natW * s;
                                destH = natH * s;
                            } else if (normFit === 'cover') {
                                const s = Math.max(bgaW / natW, bgaH / natH) * scaleFactor;
                                destW = natW * s;
                                destH = natH * s;
                            } else { // contain
                                const s = Math.min(bgaW / natW, bgaH / natH) * scaleFactor;
                                destW = natW * s;
                                destH = natH * s;
                            }

                            const drawX = (bgaW - destW) / 2;
                            const drawY = (bgaH - destH) / 2;
                            bgaCtx.imageSmoothingEnabled = true;
                            bgaCtx.imageSmoothingQuality = 'high';
                            bgaCtx.drawImage(rawImg, drawX, drawY, destW, destH);

                            imgData = bgaCanvas.toDataURL('image/jpeg', 0.95);
                            canvasCache.set(cacheKey, imgData);
                        }
                    }
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', x, y, cardW, cardH, undefined, 'FAST');
                    }
                } else {
                    const cacheKey = `${card.id}_${lang}_${whiteMargin ? 'm' + marginMm : 'nom'}_${artFit}_${artScale}`;
                    let imgData = canvasCache.get(cacheKey);
                    if (!imgData) {
                        const canvas = await renderCardToCanvas(card, lang, whiteMargin, artFit, artScale, marginMm);
                        if (canvas) {
                            imgData = canvas.toDataURL('image/jpeg', 0.95);
                            canvasCache.set(cacheKey, imgData);
                        }
                    }
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', x, y, cardW, cardH, undefined, 'FAST');
                    }
                }
            }

            // Draw cut marks on this page
            drawCropMarks(doc, marginX, marginY, cardW, cardH, cols, rows, cutType);

            // Draw bottom sheet footer: deck name (left), web URL (center), page / total (right)
            const { deckName, webUrl, pageStr } = getPrintPageFooterData(p, totalPages, lang);
            const footerLineY = 284.5;
            const footerTextY = 288.5;

            doc.setLineWidth(0.2);
            doc.setDrawColor(203, 213, 225); // slate-300
            doc.line(marginX, footerLineY, 210 - marginX, footerLineY);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(30, 41, 59); // slate-800
            doc.text(deckName, marginX + 0.5, footerTextY, { align: 'left' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139); // slate-500
            doc.text(webUrl, 105, footerTextY, { align: 'center' });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(30, 41, 59); // slate-800
            doc.text(pageStr, 210 - marginX - 0.5, footerTextY, { align: 'right' });
        }

        showZipProgress(true, 'Guardando archivo PDF...', 98, 'Generando PDF para imprimir');

        const fileName = isStrips
            ? `challengers_tiras_texto_${lang}_${expandedCards.length}copias_ahorro.pdf`
            : `challengers_cartas_${lang}_${expandedCards.length}copias_63.5x88mm.pdf`;
        doc.save(fileName);
        showToast(`¡PDF descargado con éxito! (${expandedCards.length} ${isStrips ? 'tiras de texto' : 'cartas'})`);
    } catch (err) {
        console.error('Error generando PDF:', err);
        alert('Hubo un error al generar el PDF. Puedes usar también la opción directa "Imprimir / Guardar como PDF (Nativo)".');
    } finally {
        showZipProgress(false);
        if (btn) btn.disabled = false;
        if (btnImg) btnImg.disabled = false;
        if (btnPrint) btnPrint.disabled = false;
    }
}

// Helper to generate a detailed text breakdown of the deck/selection
function generateDeckDetailsTxt(uniqueEntries, totalCopies, lang, deckName) {
    const lines = [];
    const divider = '='.repeat(80);
    const subDivider = '-'.repeat(80);

    const langNames = {
        es: 'Español',
        fr: 'Français',
        en: 'English'
    };

    lines.push(divider);
    lines.push(`DETALLES DEL MAZO / INFORMACIÓN DE CARTAS`);
    lines.push(divider);
    lines.push(`Mazo: ${deckName || 'Challengers'}`);
    lines.push(`Idioma: ${langNames[lang] || lang}`);
    lines.push(`Total de cartas físicas (copias): ${totalCopies}`);
    lines.push(`Total de cartas distintas (únicas): ${uniqueEntries.length}`);
    lines.push(`Fecha de exportación: ${new Date().toLocaleString()}`);
    lines.push('');

    // Group by faction / set
    const factionsMap = new Map();
    uniqueEntries.forEach(({ card, count }) => {
        const setInfo = (typeof setsData !== 'undefined' && setsData[card.set_id]) || {};
        const cData = card[lang] || card['es'] || card['en'] || {};
        const factionName = setInfo.name?.[lang] || setInfo.name?.['es'] || cData.type || card.set_id || 'Sin facción';

        if (!factionsMap.has(factionName)) {
            factionsMap.set(factionName, { uniqueCount: 0, totalCount: 0, cards: [] });
        }
        const fGroup = factionsMap.get(factionName);
        fGroup.uniqueCount++;
        fGroup.totalCount += count;
        fGroup.cards.push({ card, count });
    });

    lines.push(divider);
    lines.push(`RESUMEN POR FACCIONES`);
    lines.push(divider);
    factionsMap.forEach((info, fName) => {
        lines.push(`• ${fName}: ${info.uniqueCount} cartas únicas (${info.totalCount} copia${info.totalCount === 1 ? '' : 's'} en total)`);
    });
    lines.push('');

    lines.push(divider);
    lines.push(`LISTADO COMPLETO Y TEXTO DE CADA CARTA`);
    lines.push(divider);
    lines.push('');

    uniqueEntries.forEach(({ card, count }) => {
        const cData = card[lang] || card['es'] || card['en'] || {};
        const setInfo = (typeof setsData !== 'undefined' && setsData[card.set_id]) || {};
        const name = cData.name || card.name || `Carta ${card.id}`;
        const factionName = setInfo.name?.[lang] || setInfo.name?.['es'] || cData.type || card.set_id || '-';
        const level = card.level || '-';
        const strength = card.strength !== undefined ? card.strength : '-';
        const rawText = (cData.text || '').trim() || '(Sin texto / Efecto básico)';
        const idStr = String(card.id).padStart(2, '0');

        lines.push(`[#${idStr}] ${name.toUpperCase()} (x${count} copia${count === 1 ? '' : 's'})`);
        lines.push(subDivider);
        lines.push(`  • Facción: ${factionName}`);
        lines.push(`  • Nivel: ${level}`);
        lines.push(`  • Fuerza: ${strength}`);
        lines.push(`  • Texto / Efecto:`);
        rawText.split('\n').forEach(tLine => {
            lines.push(`    ${tLine.trim()}`);
        });
        lines.push('');
    });

    lines.push(divider);
    lines.push(`FIN DEL DOCUMENTO`);
    lines.push(divider);

    return lines.join('\r\n');
}

// Download selected cards as individual high-resolution PNG images bundled in a ZIP
async function downloadCardsAsImagesZIP() {
    const expandedCards = getExpandedPrintCards();
    if (expandedCards.length === 0) {
        alert('Por favor selecciona al menos una carta para descargar.');
        return;
    }

    if (typeof JSZip === 'undefined') {
        alert('La librería JSZip no está disponible. Por favor recarga la página.');
        return;
    }

    const { lang, mode, whiteMargin, marginMm, artFit, artScale } = getPrintOptions();
    const btn = document.getElementById('btnDownloadImages');
    const btnPdf = document.getElementById('btnDownloadPDF');
    const btnPrint = document.getElementById('btnPrintDirect');
    if (btn) btn.disabled = true;
    if (btnPdf) btnPdf.disabled = true;
    if (btnPrint) btnPrint.disabled = true;

    const isStrips = (mode === 'strips');
    showZipProgress(true, `Iniciando generación de imágenes PNG (${expandedCards.length} cartas)...`, 5, 'Generando cartas en PNG');

    try {
        const zip = new JSZip();

        // Group cards to render each unique card only once
        const uniqueMap = new Map();
        expandedCards.forEach(card => {
            if (!uniqueMap.has(card.id)) {
                uniqueMap.set(card.id, { card, count: 0 });
            }
            uniqueMap.get(card.id).count++;
        });

        const uniqueEntries = Array.from(uniqueMap.values());
        let processed = 0;

        for (let i = 0; i < uniqueEntries.length; i++) {
            const { card, count } = uniqueEntries[i];
            processed++;
            const pct = Math.round((processed / uniqueEntries.length) * 75) + 5;
            showZipProgress(true, `Renderizando carta ${processed} de ${uniqueEntries.length}...`, pct, 'Generando cartas en PNG');

            let canvas = null;
            if (isStrips) {
                canvas = await renderStripToCanvas(card, lang);
            } else if (mode === 'bga') {
                const bgaSrc = getCardImagePath(card.card_image || card.digital_card_path || card.card_path);
                const rawImg = await loadImage(bgaSrc);
                if (rawImg) {
                    canvas = document.createElement('canvas');
                    const bgaW = 750;
                    const bgaH = 1039;
                    canvas.width = bgaW;
                    canvas.height = bgaH;
                    const bgaCtx = canvas.getContext('2d');
                    bgaCtx.fillStyle = '#ffffff';
                    bgaCtx.fillRect(0, 0, bgaW, bgaH);

                    const natW = rawImg.naturalWidth || rawImg.width;
                    const natH = rawImg.naturalHeight || rawImg.height;
                    const scaleFactor = (Number(artScale) || 100) / 100;
                    const normFit = normalizeArtFit(artFit);

                    let destW = bgaW;
                    let destH = bgaH;
                    if (normFit === 'fit-height') {
                        const s = (bgaH / natH) * scaleFactor;
                        destW = natW * s;
                        destH = natH * s;
                    } else if (normFit === 'fit-width') {
                        const s = (bgaW / natW) * scaleFactor;
                        destW = natW * s;
                        destH = natH * s;
                    } else if (normFit === 'cover') {
                        const s = Math.max(bgaW / natW, bgaH / natH) * scaleFactor;
                        destW = natW * s;
                        destH = natH * s;
                    } else { // contain
                        const s = Math.min(bgaW / natW, bgaH / natH) * scaleFactor;
                        destW = natW * s;
                        destH = natH * s;
                    }

                    const drawX = (bgaW - destW) / 2;
                    const drawY = (bgaH - destH) / 2;
                    bgaCtx.imageSmoothingEnabled = true;
                    bgaCtx.imageSmoothingQuality = 'high';
                    bgaCtx.drawImage(rawImg, drawX, drawY, destW, destH);
                }
            } else {
                canvas = await renderCardToCanvas(card, lang, whiteMargin, artFit, artScale, marginMm);
            }

            if (canvas) {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                    const cData = card[lang] || card['es'] || card['en'] || {};
                    const cardName = (cData.name || card.name || `carta_${card.id}`)
                        .toLowerCase()
                        .replace(/[\\/:*?"<>|]/g, '_')
                        .replace(/\s+/g, '_')
                        .replace(/_+/g, '_')
                        .trim();
                    const idPrefix = String(card.id).padStart(2, '0');

                    // Exactly one PNG file per card, with _x{count}.png indicating the number of copies
                    const cardFileName = `${idPrefix}_${cardName}_x${count}.png`;
                    zip.file(cardFileName, blob);
                }
            }
        }

        // Add card backs
        const backFiles = [
            { name: 'card_back.jpg', path: 'images/card_back.jpg' },
            { name: 'card_back_robot.jpg', path: 'images/card_back_robot.jpg' }
        ];
        for (const b of backFiles) {
            const resolved = resolveZipImage(b.path) || resolveZipImage(b.name) || b.path;
            try {
                const res = await fetch(resolved);
                if (res.ok) {
                    const blob = await res.blob();
                    zip.file(b.name, blob);
                }
            } catch (errBack) {
                console.warn(`No se pudo incluir ${b.name} en el ZIP:`, errBack);
            }
        }

        // Add text file with complete deck/selection details
        const rawDeckName = (currentPackInfo && currentPackInfo.name) ? currentPackInfo.name : 'Challengers';
        const txtContent = generateDeckDetailsTxt(uniqueEntries, expandedCards.length, lang, rawDeckName);
        zip.file('detalles_mazo.txt', txtContent);

        showZipProgress(true, 'Comprimiendo archivo ZIP...', 85, 'Generando cartas en PNG');

        const zipBlob = await zip.generateAsync(
            { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
            (metadata) => {
                const zPct = Math.min(99, Math.round(85 + metadata.percent * 0.14));
                showZipProgress(true, `Comprimiendo ZIP (${Math.round(metadata.percent)}%)...`, zPct, 'Generando cartas en PNG');
            }
        );

        const safeDeckSlug = rawDeckName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const zipFileName = `${safeDeckSlug}_cartas_png_${lang}_${expandedCards.length}copias.zip`;

        const downloadUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);

        showToast(`¡ZIP con ${expandedCards.length} cartas PNG descargado con éxito!`);
    } catch (err) {
        console.error('Error generando archivo ZIP de imágenes:', err);
        alert('Hubo un error al generar las imágenes PNG en ZIP: ' + (err.message || err));
    } finally {
        showZipProgress(false);
        if (btn) btn.disabled = false;
        if (btnPdf) btnPdf.disabled = false;
        if (btnPrint) btnPrint.disabled = false;
    }
}

/**
 * Genera un overlay vectorial SVG con marcas de corte perimetrales y cruces en esquinas
 * a escala matemática exacta para guillotina o regla y cúter.
 * 
 * @param {number} cols - Número de columnas de cartas en la cuadrícula (ej: 3).
 * @param {number} rows - Número de filas de cartas (ej: 3 para cartas, 9 para tiras).
 * @param {number} cardW - Anchura de carta en milímetros (63.5 mm).
 * @param {number} cardH - Altura de carta en milímetros (88 mm o 27.5 mm).
 * @returns {string} Marcado SVG con líneas de corte en milímetros.
 */
function createCropMarksSVG(cols, rows, cardW, cardH) {
    const totalW = cols * cardW;
    const totalH = rows * cardH;
    const armIn = 2.5; // mm inward along card boundaries
    const marginTick = 4.0; // mm outward into page margins
    const strokeColor = '#475569';
    const strokeWidth = '0.25';

    const lines = [];

    for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
            const x = c * cardW;
            const y = r * cardH;

            // Horizontal cut mark segment
            const xLeft = (c === 0) ? (x - marginTick) : (x - armIn);
            const xRight = (c === cols) ? (x + marginTick) : (x + armIn);
            lines.push(`<line x1="${xLeft}" y1="${y}" x2="${xRight}" y2="${y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`);

            // Vertical cut mark segment
            const yTop = (r === 0) ? (y - marginTick) : (y - armIn);
            const yBottom = (r === rows) ? (y + marginTick) : (y + armIn);
            lines.push(`<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBottom}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`);
        }
    }

    return `
    <svg class="print-cut-overlay" viewBox="0 0 ${totalW} ${totalH}" style="overflow: visible; position: absolute; top: 0; left: 0; width: ${totalW}mm; height: ${totalH}mm; pointer-events: none; z-index: 1000;">
      ${lines.join('\n')}
    </svg>
  `;
}

// Native Print with exact 63.5 x 88 mm cards OR 63.5 x 27.5 mm text strips
/**
 * Prepara la maquetación de pliegos en el contenedor #printArea y dispara el cuadro de diálogo
 * de impresión nativo del navegador (window.print()) con estilos @media print de precisión milimétrica.
 * 
 * @returns {Promise<void>}
 */
async function printDirectNative() {
    const expandedCards = getExpandedPrintCards();
    if (expandedCards.length === 0) {
        alert('Por favor selecciona al menos una carta para imprimir.');
        return;
    }

    const btn = document.getElementById('btnPrintDirect');
    const btnPdf = document.getElementById('btnDownloadPDF');
    const btnImg = document.getElementById('btnDownloadImages');
    if (btn) btn.disabled = true;
    if (btnPdf) btnPdf.disabled = true;
    if (btnImg) btnImg.disabled = true;

    showZipProgress(true, 'Preparando páginas para impresión...', 30, 'Imprimir en navegador');

    try {
        const { lang, mode, whiteMargin, marginMm, cutType, artFit, artScale, includeSummary } = getPrintOptions();
        const isStrips = (mode === 'strips');
        const perPage = isStrips ? 27 : 9;
        const cols = 3;
        const rows = isStrips ? 9 : 3;
        const cardW = 63.5;
        const cardH = isStrips ? 27.5 : 88.0;
        const totalPages = Math.ceil(expandedCards.length / perPage);

        const printArea = document.getElementById('printArea');
        printArea.innerHTML = '';
        printArea.className = 'print-cut-' + cutType;

        // If summary cover page requested, add it as first page(s)
        if (includeSummary) {
            const summaryData = getDeckSummaryData(lang);
            const summaryPagesHTML = createDeckSummarySheetsHTML(summaryData, lang);
            summaryPagesHTML.forEach(pageHTML => {
                const summaryPageEl = document.createElement('div');
                summaryPageEl.className = 'print-page print-summary-page';
                summaryPageEl.innerHTML = `
            <div class="deck-summary-sheet print-native-summary">
              ${pageHTML}
            </div>
          `;
                printArea.appendChild(summaryPageEl);
            });
        }

        for (let p = 0; p < totalPages; p++) {
            const pageEl = document.createElement('div');
            pageEl.className = 'print-page' + (isStrips ? ' is-strips-page' : '');
            pageEl.style.position = 'relative';

            const gridEl = document.createElement('div');
            gridEl.className = 'print-grid';

            const pageCards = expandedCards.slice(p * perPage, (p + 1) * perPage);
            for (let c = 0; c < perPage; c++) {
                const card = pageCards[c];
                const wrap = document.createElement('div');

                if (isStrips) {
                    wrap.className = 'print-strip-wrapper is-print-square' + (!card ? ' empty-slot' : '');
                    if (card) {
                        wrap.innerHTML = createCardStripHTML(card, lang, true);
                    }
                } else {
                    wrap.className = 'print-card-wrapper is-print-square' + (!card ? ' empty-slot' : '');
                    if (card) {
                        if (mode === 'bga') {
                            const bgaSrc = getCardImagePath(card.card_image || card.digital_card_path || card.card_path);
                            wrap.innerHTML = `
                <div class="c-photo-card is-print-square" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  <img class="${normalizeArtFitClass(artFit)}" src="${bgaSrc}" style="transform: scale(${artScale / 100}); transform-origin: center center;">
                </div>
              `;
                        } else {
                            // Pass isPrintMode = true for square corners, whiteMargin, artFit, artScale, marginMm
                            wrap.innerHTML = createCardTemplateHTML(card, lang, true, whiteMargin, artFit, artScale, marginMm);
                        }
                    }
                }
                gridEl.appendChild(wrap);
            }

            // Add guillotine intersection crosses & margin ticks when 'crosses' is selected
            if (cutType === 'crosses') {
                const overlayWrapper = document.createElement('div');
                overlayWrapper.className = 'print-cut-overlay-wrapper';
                overlayWrapper.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 1000;';
                overlayWrapper.innerHTML = createCropMarksSVG(cols, rows, cardW, cardH);
                gridEl.appendChild(overlayWrapper);
            }

            pageEl.appendChild(gridEl);

            // Add bottom sheet footer: deck name (left), web URL (center), page / total (right)
            const { deckName, webUrl, pageStr } = getPrintPageFooterData(p, totalPages, lang);
            const footerEl = document.createElement('div');
            footerEl.className = 'print-sheet-footer';
            footerEl.innerHTML = `
        <span class="sheet-footer-deck">${deckName}</span>
        <span class="sheet-footer-web">${webUrl}</span>
        <span class="sheet-footer-page">${pageStr}</span>
      `;
            pageEl.appendChild(footerEl);

            printArea.appendChild(pageEl);
        }

        // CRITICAL: Ensure ALL images inside printArea are fully loaded and decoded before triggering window.print()
        const allImgs = Array.from(printArea.querySelectorAll('img'));
        await Promise.all(allImgs.map(async img => {
            img.removeAttribute('loading');
            if (img.complete && img.naturalWidth > 0) return;
            if (img.decode) {
                try {
                    await img.decode();
                    return;
                } catch (e) { }
            }
            await new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 800);
            });
        }));

        // Save root overflow states to avoid truncating print pages
        const prevHtmlOverflow = document.documentElement.style.overflow;
        const prevBodyOverflow = document.body.style.overflow;

        // Allow document root to paginate freely
        document.documentElement.style.overflow = 'visible';
        document.body.style.overflow = 'visible';

        // Restore root overflow states once print dialog completes or is cancelled
        let restored = false;
        const restoreOverflow = () => {
            if (restored) return;
            restored = true;
            document.documentElement.style.overflow = prevHtmlOverflow;
            document.body.style.overflow = prevBodyOverflow;
        };

        window.addEventListener('afterprint', restoreOverflow, { once: true });

        // Allow browser layout and paint cycle to settle completely
        await new Promise(r => setTimeout(r, 200));

        showZipProgress(false);
        window.print();
        // In case afterprint is not supported by the environment, restore after window.print unblocks
        restoreOverflow();
    } finally {
        showZipProgress(false);
        if (btn) btn.disabled = false;
        if (btnPdf) btnPdf.disabled = false;
        if (btnImg) btnImg.disabled = false;
    }
}

