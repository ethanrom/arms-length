/**
 * The references of /science, numbered in the order they are listed. Citations and links are the ones gathered in the
 * project's research notes and docs/MODEL.md (Sources). An entry has a link only where a source we actually opened gave
 * one; nothing here is a guessed DOI or URL.
 */

export const REPO_URL = "https://github.com/ethanrom/arms-length";

/** A file or folder in the repository, on GitHub. */
export function codeUrl(path: string): string {
  const folder = !/\.[a-z0-9]+$/i.test(path);
  return `${REPO_URL}/${folder ? "tree" : "blob"}/main/${path}`;
}

export interface Reference {
  key: string;
  authors: string;
  year?: number;
  /** Omitted where our sources give none (we do not reconstruct titles from memory). */
  title?: string;
  venue: string;
  links: { label: string; href: string }[];
  /** What we take from it. */
  used: string;
}

export const REFERENCES: readonly Reference[] = [
  {
    key: "watson2005",
    authors: "Watson, A.B. & Ahumada, A.J. Jr.",
    year: 2005,
    title: "A standard model for foveal detection of spatial contrast",
    venue: "Journal of Vision 5(9):6, 717–740",
    links: [
      { label: "doi:10.1167/5.9.6", href: "https://doi.org/10.1167/5.9.6" },
      { label: "Journal page", href: "https://jov.arvojournals.org/article.aspx?articleid=2121870" },
    ],
    used: "The detector and its constants (Table 5), used unchanged; the 43 ModelFest thresholds it was fitted to.",
  },
  {
    key: "modelfest",
    authors: "ModelFest consortium (NASA Ames), published with Watson & Ahumada",
    year: 2005,
    title: "ModelFest baseline data set: 43 stimuli, 16 observers, 10 laboratories",
    venue: "Data page (archived)",
    links: [{ label: "Archived page", href: "http://web.archive.org/web/20060101050608/http://vision.arc.nasa.gov/modelfest/" }],
    used: "The observed thresholds we compare against. Only per-stimulus summaries are kept in the repository.",
  },
  {
    key: "ruefer2005",
    authors: "Rüfer, F., Schröder, A. & Erb, C.",
    year: 2005,
    title: "White-to-white corneal diameter: normal values in healthy humans obtained with the Orbscan II topography system",
    venue: "Cornea 24(3):259–261",
    links: [{ label: "doi:10.1097/01.ico.0000148312.01805.53", href: "https://doi.org/10.1097/01.ico.0000148312.01805.53" }],
    used: "The iris as a ruler: the white-to-white (visible iris) diameter is 11.71 mm, standard deviation 0.42 mm, over 743 eyes of 390 healthy people aged 10 to 80.",
  },
  {
    key: "srgb",
    authors: "IEC",
    year: 1999,
    title: "IEC 61966-2-1:1999 (sRGB)",
    venue: "International standard",
    links: [],
    used: "The transfer function that turns photo pixels into linear light before any contrast is measured.",
  },
  {
    key: "flament2015",
    authors: "Flament, F. et al.",
    year: 2015,
    title: "Facial skin pores: a multiethnic study",
    venue: "Clin Cosmet Investig Dermatol 8:85–93",
    links: [],
    used: "Pores are counted from 0.25 mm upward: the basis of the pore size prior.",
  },
  {
    key: "barten1999",
    authors: "Barten, P.G.J.",
    year: 1999,
    title: "Contrast Sensitivity of the Human Eye and Its Effects on Image Quality",
    venue: "SPIE Press",
    links: [],
    used: "A sanity check on the luminance trend only; about 2.6 times too sensitive for ModelFest's windowed patterns.",
  },
  {
    key: "castle2024",
    authors: "Ashraf, M., Mantiuk, R.K., Chapiro, A. & Wuerger, S.",
    year: 2024,
    title: "castleCSF: a contrast sensitivity function of color, area, spatio-temporal frequency, luminance and eccentricity",
    venue: "Journal of Vision 24(4):5",
    links: [
      { label: "Journal page", href: "https://jov.arvojournals.org/article.aspx?articleid=2793530" },
      { label: "PDF", href: "https://www.cl.cam.ac.uk/research/rainbow/projects/castleCSF/castleCSF_2024.pdf" },
      { label: "Code (MIT)", href: "https://github.com/gfxdisp/castleCSF" },
    ],
    used: "The luminance factor that moves 30 cd/m² thresholds to the viewing light, and the red-green disc channel.",
  },
  {
    key: "peli1990",
    authors: "Peli, E.",
    year: 1990,
    title: "Contrast in complex images",
    venue: "Journal of the Optical Society of America A 7(10):2032–2040",
    links: [{ label: "PDF", href: "https://pelilab.partners.org/papers/Contrast%20in%20Complex%201990.pdf" }],
    used: "Band-limited local contrast, the basis of the Step back picture.",
  },
  {
    key: "peli1996",
    authors: "Peli, E.",
    year: 1996,
    title: "Test of a model of foveal vision by using simulations",
    venue: "Journal of the Optical Society of America A 13(6):1131–1138",
    links: [{ label: "PDF", href: "https://pelilab.partners.org/papers/josa/eli_fov_96.pdf" }],
    used: "The test that distance simulations of this kind look like the real thing at that distance.",
  },
  {
    key: "mullen1985",
    authors: "Mullen, K.T.",
    year: 1985,
    title: "The contrast sensitivity of human colour vision to red-green and blue-yellow chromatic gratings",
    venue: "Journal of Physiology 359:381–400 (PMID 3999044)",
    links: [{ label: "Scan", href: "https://mvr.mcgill.ca/Kathy/PDF-85-94/Mullen-1985.pdf" }],
    used: "Colour vision is low-pass: red-green contrast stays visible for large soft patches (redness).",
  },
  {
    key: "stockman2000",
    authors: "Stockman, A. & Sharpe, L.T.",
    year: 2000,
    title: "The spectral sensitivities of the middle- and long-wavelength-sensitive cones derived from measurements in observers of known genotype",
    venue: "Vision Research 40:1711–1737; CIE 170-1:2006",
    links: [],
    used: "The cone fundamentals behind castleCSF's cone space.",
  },
  {
    key: "hunt",
    authors: "Hunt, R.W.G.",
    title: "The Reproduction of Colour, with the D65-normalised matrix as tabulated in Fairchild, M.D., Color Appearance Models",
    venue: "Hunt-Pointer-Estevez cone space",
    links: [],
    used: "The cone space for our red-green cone contrast.",
  },
  {
    key: "hall1966",
    authors: "Hall, E.T.",
    year: 1966,
    title: "The Hidden Dimension",
    venue: "Doubleday",
    links: [{ label: "Archive.org copy", href: "https://archive.org/details/hiddendimensionhall00hall" }],
    used: "Personal and social distance zones: the everyday distances on the axes (a conversation, across a table).",
  },
  {
    key: "ward2018",
    authors: "Ward, B., Ward, M., Fried, O. & Paskhover, B.",
    year: 2018,
    title: "Nasal distortion in short-distance photographs: the selfie effect",
    venue: "JAMA Facial Plastic Surgery 20(4):333–335",
    links: [{ label: "doi:10.1001/jamafacial.2018.0009", href: "https://doi.org/10.1001/jamafacial.2018.0009" }],
    used: "Selfies are typically taken at about 30 cm: the mirror-and-selfie end of our distance axis.",
  },
  {
    key: "berkley1975",
    authors: "Berkley, M.A., Kitterle, F. & Watkins, D.W. (1975); Rovamo, J. et al. (1993)",
    venue: "The oblique effect, as used by Watson & Ahumada (2005); the area model, as used in castleCSF",
    links: [],
    used: "The oblique effect (fixed, not fitted, in the detector) and how sensitivity grows with the size of a patch (inside castleCSF).",
  },
];

const INDEX = new Map(REFERENCES.map((r, i) => [r.key, i + 1]));

/** The number a reference is cited by. */
export function refNumber(key: string): number {
  const n = INDEX.get(key);
  if (n === undefined) throw new Error(`unknown reference ${key}`);
  return n;
}
