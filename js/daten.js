/* The 25 Hours Store · alle Inhalte der Website an EINER Stelle.
   Texte, Öffnungszeiten, Impressum, Kategorien, Produkte, Hotspot Positionen.
   Positionen (pos, hub) sind Prozent vom Szenenbild: [x, y], 0 0 = oben links. pos: null = kein Punkt im Bild
   (Produkt liegt im Foto zu weit unten hinter der Produktleiste), es bleibt über die Leiste klickbar.
   Kein Gedankenstrich in Texten (Naders Regel). */
window.STORE = {
  name: "The 25 Hours Store",
  claim: "Ein Tag hat 24 Stunden. Wir haben eine mehr.",
  slogans: ["Der wichtigste Zwischenstopp des Tages.", "Alles. Jederzeit. Für dich."],

  ueber: {
    titel: "Dein Späti. Nur eine Stunde größer.",
    text: [
      "The 25 Hours Store ist der Laden für alles, was zwischendurch fehlt. Kalte Drinks aus der Kühlwand, Chips und Nüsse für den Abend, eine Wand voller Fruchtgummi, Eis aus der Truhe, Bier und Wein für spontane Pläne. Dazu Zeitung, Ladekabel, Batterien und all die kleinen Dinge, die man genau dann braucht, wenn sonst alles zu hat.",
      "Wir sind ein echter Berliner Späti mit dem Anspruch eines modernen Convenience Stores: hell, aufgeräumt, schnell an der Kasse und immer gut sortiert. Rein, finden, weiter. Oder kurz bleiben und quatschen."
    ],
    fakten: [
      { zahl: "25", text: "Stunden Haltung. Wir sind da, wenn du uns brauchst." },
      { zahl: "6", text: "Bereiche im Laden, von der Kühlwand bis zur Kasse." },
      { zahl: "1", text: "Stopp für alles, was zwischendurch fehlt." }
    ],
    imagefilm: null // z. B. "assets/video/imagefilm.mp4", erscheint dann im Bereich Über uns
  },

  standort: {
    zeile1: "Märkisches Zentrum",
    strasse: "Wilhelmsruher Damm 140",
    ort: "13439 Berlin",
    bezirk: "Märkisches Viertel, Reinickendorf",
    telefon: "030 4155448",
    karte: "https://www.google.com/maps/search/?api=1&query=Wilhelmsruher+Damm+140+13439+Berlin",
    anfahrt: "U8 oder S1 bis Wittenau, dann mit dem Bus bis Märkisches Zentrum."
  },

  // 0 = Sonntag ... 6 = Samstag. Quelle: Branchenverzeichnis, vom Laden noch zu bestätigen.
  zeiten: {
    geprueft: false,
    tage: [
      { tag: "Sonntag", kurz: "So", von: "07:00", bis: "11:00" },
      { tag: "Montag", kurz: "Mo", von: "04:30", bis: "20:00" },
      { tag: "Dienstag", kurz: "Di", von: "04:30", bis: "20:00" },
      { tag: "Mittwoch", kurz: "Mi", von: "04:30", bis: "20:00" },
      { tag: "Donnerstag", kurz: "Do", von: "04:30", bis: "20:00" },
      { tag: "Freitag", kurz: "Fr", von: "04:30", bis: "20:00" },
      { tag: "Samstag", kurz: "Sa", von: "04:30", bis: "20:00" }
    ]
  },

  impressum: {
    // Pflichtangaben nach § 5 DDG. Fehlende Felder bleiben "wird ergänzt", bis der Laden sie liefert.
    firma: "The 25 Hours Store",
    inhaber: "",
    rechtsform: "",
    strasse: "Wilhelmsruher Damm 140",
    ort: "13439 Berlin",
    telefon: "030 4155448",
    email: "",
    ustid: "",
    register: "",
    verantwortlich: ""
  },

  kategorien: [
    {
      id: "drinks", name: "Drinks", neon: "#7fe7ff", hub: [11, 50], szene: "drinks",
      titel: "Eiskalt aus der Kühlwand",
      text: "Cola, Mate, Energy, Wasser, Eistee und Saft. Sechs Türen voller Abkühlung, immer gut gefüllt.",
      produkte: [
        { id: "cola", name: "Cola", info: "0,33 l Dose", text: "Der Klassiker, eiskalt aus der Kühlwand. Mit Zucker oder ohne.", tags: ["kalt", "Dose"], pos: [42, 36] },
        { id: "mate", name: "Mate Limonade", info: "0,5 l Glasflasche", text: "Koffein mit Berliner Seele. Für lange Nächte und kurze Pausen.", tags: ["kalt", "Koffein"], pos: [57, 22] },
        { id: "energy", name: "Energy Drink", info: "0,25 l Dose", text: "Für den Schub zwischendurch. Viele Sorten, auch zuckerfrei.", tags: ["kalt", "Koffein"], pos: [46, 52] },
        { id: "wasser", name: "Wasser", info: "0,5 l, still oder sprudelnd", text: "Einfach Wasser. Immer kalt, immer da.", tags: ["kalt", "vegan"], pos: [83, 57] },
        { id: "eistee", name: "Eistee Pfirsich", info: "0,5 l Flasche", text: "Süß, fruchtig, kalt. Der Sommer in der Flasche.", tags: ["kalt"], pos: [74, 45] },
        { id: "osaft", name: "Orangensaft", info: "0,33 l Glasflasche", text: "Frisch gepresst schmeckt man. Vitamine für unterwegs.", tags: ["kalt", "vegan"], pos: [10, 27] }
      ]
    },
    {
      id: "snacks", name: "Snacks", neon: "#ffb547", hub: [31, 60], szene: "snacks",
      titel: "Chips, Nüsse und alles, was knuspert",
      text: "Das Regal für den Filmabend, die Bahnfahrt und den kleinen Hunger um Mitternacht.",
      produkte: [
        { id: "paprika", name: "Chips Paprika", info: "Tüte, 175 g", text: "Würzig, rot, unschlagbar. Die Nummer eins im Regal.", tags: ["vegan"], pos: [36, 28] },
        { id: "classic", name: "Chips Gesalzen", info: "Tüte, 175 g", text: "Nur Kartoffel und Salz. Weniger braucht es nicht.", tags: ["vegan"], pos: [48, 28] },
        { id: "nacho", name: "Tortilla Chips Nacho", info: "Tüte, 125 g", text: "Mit Käsegeschmack. Perfekt zum Dippen.", tags: [], pos: [30, 43] },
        { id: "erdnuesse", name: "Erdnüsse geröstet", info: "Beutel, 200 g", text: "Geröstet und gesalzen. Der Begleiter fürs Feierabendbier.", tags: ["vegan"], pos: [40, 56] },
        { id: "brezeln", name: "Salzbrezeln", info: "Beutel, 250 g", text: "Knusprige Sticks mit grobem Salz. Teilen ist erlaubt.", tags: ["vegan"], pos: [58, 43] },
        { id: "jerky", name: "Beef Jerky", info: "Beutel, 50 g", text: "Getrocknetes Rindfleisch, würzig mariniert. Protein für unterwegs.", tags: ["Protein"], pos: null }
      ]
    },
    {
      id: "sweets", name: "Sweets", neon: "#ff5fd2", hub: [78, 47], szene: "sweets",
      titel: "Die Fruchtgummi Wand",
      text: "Bunte Tüten von oben bis unten, darunter Schokolade, Lollis und Kaugummi. Hier wird jeder wieder Kind.",
      produkte: [
        { id: "gummibaeren", name: "Gummibären", info: "Tüte, 175 g", text: "Bunt gemischt, fruchtig, zum Teilen oder auch nicht.", tags: ["Fruchtgummi"], pos: [20, 40] },
        { id: "sauer", name: "Saure Schnüre", info: "Tüte, 200 g", text: "Regenbogen mit Zuckerkruste. Sauer macht lustig.", tags: ["Fruchtgummi"], pos: [62, 48] },
        { id: "karamell", name: "Karamell Riegel", info: "Riegel, 50 g", text: "Weiches Karamell unter Schokolade. Die schnelle Belohnung.", tags: ["Schokolade"], pos: null },
        { id: "vollmilch", name: "Vollmilch Schokolade", info: "Tafel, 100 g", text: "Zartschmelzend und klassisch. Eine Reihe geht immer.", tags: ["Schokolade"], pos: null },
        { id: "mint", name: "Kaugummi Minze", info: "Packung, 10 Stück", text: "Frischer Atem für das nächste Date.", tags: ["zuckerfrei"], pos: null },
        { id: "lolli", name: "Lollis", info: "einzeln oder im Becher", text: "Riesige Spiralen in allen Farben. Hält länger als jede Ausrede.", tags: [], pos: null }
      ]
    },
    {
      id: "eis", name: "Eis", neon: "#9ec9ff", hub: [91, 71], szene: "eis",
      titel: "Die Eistruhe",
      text: "Eis am Stiel, Sandwich, Becher und Waffel. Auch im Winter, versprochen.",
      produkte: [
        { id: "schoko", name: "Schoko Eis am Stiel", info: "Stück, 90 ml", text: "Vanille im knackigen Schokomantel.", tags: ["Tiefkühl"], pos: [47, 50] },
        { id: "sandwich", name: "Eis Sandwich", info: "Stück, 110 ml", text: "Vanilleeis zwischen zwei Kakaokeksen.", tags: ["Tiefkühl"], pos: [72, 33] },
        { id: "cookie", name: "Cookie Dough Becher", info: "Becher, 465 ml", text: "Für den Abend auf dem Sofa. Löffel nicht vergessen.", tags: ["Tiefkühl"], pos: [30, 52] },
        { id: "vanille", name: "Vanille Waffel", info: "Hörnchen, 120 ml", text: "Softeis Gefühl mit knuspriger Waffel.", tags: ["Tiefkühl"], pos: [63, 56] },
        { id: "erdbeere", name: "Erdbeer Fruchteis", info: "Stück, 80 ml", text: "Fruchtig, leicht, eiskalt.", tags: ["Tiefkühl", "vegan"], pos: [50, 64] },
        { id: "mango", name: "Mango Sorbet", info: "Becher, 465 ml", text: "Sonne pur, ganz ohne Milch.", tags: ["Tiefkühl", "vegan"], pos: [25, 62] }
      ]
    },
    {
      id: "bierwein", name: "Bier & Wein", neon: "#ffd36b", hub: [87, 37], szene: "bierwein",
      titel: "Bier, Wein und Sekt",
      text: "Für spontane Pläne und gute Abende. Abgabe von Bier, Wein und Sekt ab 16 Jahren, Spirituosen ab 18. Bitte Ausweis bereithalten.",
      hinweis: "Abgabe nur nach Jugendschutzgesetz. Bier, Wein, Sekt ab 16, Spirituosen ab 18.",
      produkte: [
        { id: "pils", name: "Pils", info: "0,5 l Flasche", text: "Herb und frisch. Der Feierabend in der Flasche.", tags: ["ab 16", "kalt"], pos: [83, 39] },
        { id: "hell", name: "Helles", info: "0,5 l Dose", text: "Mild, süffig, gut gekühlt.", tags: ["ab 16", "kalt"], pos: [84, 53] },
        { id: "radler", name: "Radler", info: "0,33 l Flasche", text: "Halb Bier, halb Zitrone. Für warme Tage.", tags: ["ab 16", "kalt"], pos: [68, 62] },
        { id: "rotwein", name: "Rotwein", info: "0,75 l Flasche", text: "Trocken und rund. Für das Essen mit Freunden.", tags: ["ab 16"], pos: [10, 24] },
        { id: "weisswein", name: "Weißwein", info: "0,75 l Flasche", text: "Frisch und fruchtig, gerne gut gekühlt.", tags: ["ab 16"], pos: [32, 39] },
        { id: "sekt", name: "Sekt", info: "0,75 l Flasche", text: "Weil jeder Anlass ein Anlass ist.", tags: ["ab 16"], pos: [62, 21] }
      ]
    },
    {
      id: "kasse", name: "Kasse & Alltag", neon: "#ff7a3d", hub: [51, 50], szene: "kasse",
      titel: "An der Kasse und für den Alltag",
      text: "Zeitung, Magazine, Ladekabel, Batterien und Prepaid Guthaben. Tabakwaren gibt es an der Kasse, nur ab 18. Zahlen kannst du bar oder mit Karte.",
      hinweis: "Tabakwaren nur an der Kasse und nur ab 18 Jahren.",
      produkte: [
        { id: "zeitung", name: "Tageszeitung", info: "täglich frisch", text: "Die wichtigsten Nachrichten des Tages, auf Papier.", tags: ["täglich"], pos: [12, 47] },
        { id: "magazin", name: "Magazine", info: "große Auswahl", text: "Von Sport bis Lifestyle. Lesestoff für die Bahn.", tags: [], pos: [11, 62] },
        { id: "usbc", name: "Ladekabel USB C", info: "1 m", text: "Akku leer? Wir haben das passende Kabel.", tags: ["Notfall"], pos: [79, 58] },
        { id: "batterien", name: "Batterien AA", info: "4er Pack", text: "Für Fernbedienung, Controller und alles dazwischen.", tags: [], pos: [71, 63] },
        { id: "taschentuecher", name: "Taschentücher", info: "Packung", text: "Klein, weich, immer griffbereit.", tags: [], pos: null },
        { id: "prepaid", name: "Prepaid Guthaben", info: "für alle Netze", text: "Handy aufladen direkt an der Kasse.", tags: ["Service"], pos: [55, 59] }
      ]
    }
  ]
};
