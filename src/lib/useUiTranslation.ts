import { useEffect } from 'react';
import { useLanguage } from '@/lib/useLanguage';

const EN: Record<string, string> = {
  'Atgal': 'Back', 'Pranešimai': 'Notifications', 'Parametrai': 'Settings', 'Pridėti skelbimą': 'Add listing', 'Pridėti': 'Add',
  'Kortelės': 'Cards', 'Sąrašas': 'List', 'Žemėlapis': 'Map', 'Įkeliama…': 'Loading…', 'Tikrinama…': 'Checking…', 'Siunčiama…': 'Sending…',
  'Aš Vairuotojas': 'I’m a driver', 'Aš Keleivis': 'I’m a passenger', 'Siūlau pavežėti': 'I offer a ride', 'Ieškau kelionės': 'I’m looking for a ride',
  'Keleivių skelbimai': 'Passenger listings', 'Vairuotojų pasiūlymai': 'Driver offers', 'Siūlykite savo kelionę keleiviui': 'Offer your trip to a passenger',
  'Rinkitės vairuotoją arba laukite pasiūlymų': 'Choose a driver or wait for offers', 'Gautos užklausos': 'Received requests', 'Patvirtintos': 'Accepted', 'Atmestos': 'Rejected',
  'Vairuotojas': 'Driver', 'Keleivis': 'Passenger', 'Pasikartojantis': 'Recurring', 'vietos': 'seats', 'keleiviai': 'passengers', 'keleivis': 'passenger',
  'Bagažas:': 'Luggage:', 'Peržiūrėti maršrutą žemėlapyje': 'View route on map', 'Susisiekti dėl kainos': 'Contact about price', 'Pasirinkti šį skelbimą': 'Choose this listing',
  'Laukia patvirtinimo': 'Pending approval', 'Patvirtinta': 'Accepted', 'Atmesta': 'Rejected', 'Atšaukta': 'Cancelled', 'Pasiūlymas priimtas': 'Offer accepted',
  'Laukia jūsų atsakymo': 'Waiting for your response', 'Vairuotojo pasiūlymas': 'Driver offer', 'Preliminarus nuokrypis tiesia linija': 'Estimated straight-line detour',
  'Jūsų maršrutas:': 'Your route:', 'Jūsų skelbimas': 'Your listing', 'Vairuotojo atsakymas:': 'Driver reply:', 'Atmesti': 'Reject', 'Priimti pasiūlymą': 'Accept offer',
  'Patvirtinti': 'Accept', 'Atšaukti pasiūlymą': 'Cancel offer', 'Atšaukti užklausą': 'Cancel request', 'Atšaukti kelionę': 'Cancel trip', 'Susisiekti': 'Contact',
  'Navigacija': 'Navigation', 'Peržiūrėti maršrutą': 'View route', 'Pasirinkti skelbimą': 'Choose listing', 'Vairuotojo maršrutas': 'Driver route', 'Kaina:': 'Price:',
  'Iš kur (paėmimo vieta)': 'Pickup location', 'Į kur (išlaipinimo vieta)': 'Drop-off location', 'Preliminarus papildomas atstumas tiesia linija': 'Estimated extra straight-line distance',
  'Vairuotojo maršrutas:': 'Driver route:', 'Jūsų kelionės atstumas:': 'Your trip distance:', 'Jūsų vardas': 'Your name', 'Telefonas (nebūtina)': 'Phone (optional)',
  'Keleivių skaičius': 'Number of passengers', 'Bagažas': 'Luggage', 'Nenurodyta': 'Not specified', 'Nėra bagažo': 'No luggage', 'Mažas (kuprinė)': 'Small (backpack)',
  'Vidutinis (lagaminas)': 'Medium (suitcase)', 'Didelis (keli lagaminai)': 'Large (several suitcases)', 'Pastabos vairuotojui (nebūtina)': 'Notes for driver (optional)',
  'Siųsti užklausą vairuotojui': 'Send request to driver', 'Siūlyti pavežėjimą': 'Offer a ride', 'Keleivio maršrutas': 'Passenger route', 'Jūsų kelionė': 'Your trip',
  'Neturite aktyvios vairuotojo kelionės tuo pačiu metu. Pirmiausia ją sukurkite.': 'You do not have an active driver trip at that time. Create one first.',
  'Žinutė keleiviui (nebūtina)': 'Message to passenger (optional)', 'Siųsti pasiūlymą': 'Send offer', 'Uždaryti': 'Close',
  'Redaguoti skelbimą': 'Edit listing', 'Ieškoti kelionės': 'Look for a ride', 'Iš kur': 'From', 'Į kur': 'To',
  'Kada važiuojate': 'Departure time', 'Telefonas': 'Phone', 'Vietų skaičius': 'Seats', 'Kaina': 'Price', 'Pastabos': 'Notes', 'Išsaugoti': 'Save', 'Išsaugota': 'Saved',
  'Nustatoma jūsų vieta…': 'Detecting your location…', 'Nepavyko nustatyti jūsų vietos. Leiskite prieigą prie vietos naršyklės nustatymuose, kad matytumėte savo poziciją žemėlapyje.': 'Could not determine your location. Allow location access in browser settings to see your position on the map.',
  'Skelbimas sukurtas!': 'Listing created!', 'Skelbimas atnaujintas!': 'Listing updated!', 'Pasiūlymas išsiųstas!': 'Offer sent!', 'Užklausa išsiųsta!': 'Request sent!',
  'Užklausa patvirtinta!': 'Request accepted!', 'Užklausa atmesta': 'Request rejected', 'Užklausa atšaukta': 'Request cancelled',
  'Nepavyko įkelti skelbimų. Bandykite vėliau.': 'Could not load listings. Please try again later.', 'Nepavyko įkelti užklausų. Bandykite dar kartą.': 'Could not load requests. Please try again.',
  'Šiai kelionei nepakanka laisvų vietų.': 'Not enough seats are available for this trip.', 'Nepavyko atnaujinti užklausos. Bandykite dar kartą.': 'Could not update the request. Please try again.',
  'Užpildykite vardą, iš kur ir į kur laukus.': 'Fill in your name, pickup and drop-off fields.', 'Keleivių skaičius turi būti nuo 1 iki 8.': 'Number of passengers must be between 1 and 8.',
  'Kai kurie laukai per ilgi. Sutrumpinkite tekstą.': 'Some fields are too long. Shorten the text.', 'Įveskite teisingą telefono numerį.': 'Enter a valid phone number.',
  'Šis skelbimas nebeaktyvus. Grįžkite į sąrašą ir pasirinkite kitą.': 'This listing is no longer active. Return to the list and choose another.',
  'Ši kelionė jau prasidėjo arba išvykimo laikas praėjo.': 'This trip has already started or its departure time has passed.', 'Negalite siųsti užklausos į savo skelbimą.': 'You cannot send a request to your own listing.',
  'Šią kelionę jau pasirinkote.': 'You have already chosen this trip.', 'Šiai kelionei jau išsiuntėte užklausą.': 'You have already sent a request for this trip.',
  'Šiai kelionei jau turite aktyvią užklausą.': 'You already have an active request for this trip.', 'Nepavyko išsiųsti užklausos. Bandykite dar kartą.': 'Could not send the request. Please try again.',
  'Pasirinkite savo vairuotojo kelionę.': 'Choose one of your driver trips.', 'Pasiūlymo laikas turi sutapti su keleivio skelbimo laiku (leisti skirtumas iki 60 minučių).': 'The offer time must match the passenger listing (up to 60 minutes difference).',
  'Šio keleivio skelbimo savininko nepavyko nustatyti.': 'Could not identify the owner of this passenger listing.', 'Šiam keleivio skelbimui jau yra aktyvus pasiūlymas.': 'There is already an active offer for this passenger listing.',
  'Nepavyko išsiųsti pasiūlymo.': 'Could not send the offer.', 'laukianti užklausa': 'pending request', 'laukiančios užklausos': 'pending requests',
  'Žinutės': 'Messages', 'Rašykite žinutę…': 'Write a message…', 'Siųsti': 'Send', 'Maršrutas': 'Route', 'Profilis': 'Profile', 'Įvertinimai': 'Ratings', 'Įvertinti': 'Rate',
  'Pašalinti': 'Delete', 'Atšaukti': 'Cancel', 'Patvirtinti pašalinimą': 'Confirm deletion', 'Priežastis': 'Reason', 'Pasirinkite priežastį': 'Choose a reason',
  'Filtrai': 'Filters', 'Iš': 'From', 'Į': 'To', 'Data': 'Date', 'Maks. kaina': 'Max price', 'Vietų min.': 'Min seats', 'Atstumas': 'Distance', 'Išvalyti': 'Clear',
  'Rodyti daugiau': 'Show more', 'Nieko nerasta': 'Nothing found', 'Nėra skelbimų': 'No listings', 'Mano kelionės': 'My trips', 'Mano užklausos': 'My requests', 'Mano pasiūlymai': 'My offers',
  'Naujos užklausos': 'New requests', 'Naujos žinutės': 'New messages', 'Kelionės priminimai': 'Trip reminders', 'Paskyros informacija': 'Account information',
  'Automobilio informacija (užpildykite, jei vairuotojas)': 'Car information (fill in if you are a driver)', 'Numatytasis vaidmuo': 'Default role', 'Išvaizda': 'Appearance',
  'Tamsusis režimas': 'Dark mode', 'Eksperimentinis': 'Experimental', 'Kalba': 'Language', 'Pasirinkite programos kalbą': 'Choose app language', 'Atsijungti': 'Sign out',
  'Vardas': 'Name', 'El. paštas': 'Email', 'Markė': 'Make', 'Spalva': 'Color', 'Valst. numeris': 'License plate',
  'Neteisingas telefono formatas.': 'Invalid phone format.', 'Nepavyko pateikti vertinimo.': 'Could not submit rating.', 'Šią kelionę jau įvertinote.': 'You have already rated this trip.',
  'Skelbimo galiojimas': 'Listing validity', 'Kelionės laikas praėjo. Šis skelbimas dar bus rodomas 24 valandas, o tada bus automatiškai pašalintas.': 'The trip time has passed. This listing will remain visible for 24 hours and will then be removed automatically.',

  // Trip form and validation
  'Užpildykite iš, į kur ir vardą.': 'Fill in the origin, destination and name.', 'Pasirinkite teisingą išvykimo laiką.': 'Choose a valid departure time.',
  'Išvykimo laikas turi būti bent po 5 minučių.': 'Departure time must be at least 5 minutes from now.', 'Vietų skaičius turi būti nuo 1 iki 8.': 'Number of seats must be between 1 and 8.',
  'Užpildykite automobilio markę, spalvą ir valst. numerį.': 'Enter the car make, color and license plate.', 'Įveskite teisingą kainą.': 'Enter a valid price.',
  'Nurodykite viešai rodomus miestus arba vietoves.': 'Specify the publicly shown cities or areas.',
  'Skelbimas turi aktyvių užklausų. Prieš redaguodami jas užbaikite arba atšaukite.': 'This listing has active requests. Complete or cancel them before editing.',
  'Nepavyko išsaugoti skelbimo. Patikrinkite laukus ir bandykite dar kartą.': 'Could not save the listing. Check the fields and try again.',
  'Preliminari kaina, € (nebūtina)': 'Estimated price, € (optional)', 'Automobilio informacija (privaloma)': 'Car information (required)',
  'Pastabos (nebūtina)': 'Notes (optional)', 'Pasikartojantis skelbimas': 'Recurring listing', '/ asm.': '/ person', '/ viso': '/ total',
  'pvz. Vilnius, Centras': 'e.g. Vilnius, Center', 'pvz. Trakai': 'e.g. Trakai', 'pvz. Jonas': 'e.g. John', 'pvz. 5': 'e.g. 5',
  'Markė (pvz. VW Golf)': 'Make (e.g. VW Golf)', 'Spalva (pvz. raudona)': 'Color (e.g. red)', 'Valst. nr. (pvz. ABC123)': 'Plate (e.g. ABC123)',
  'pvz. bagažinė laisva, kaina derinama': 'e.g. trunk space available, price negotiable', 'pvz. važiuoju su vaikų kėdute, kaina derinama': 'e.g. travelling with a child seat, price negotiable',
  'pvz. važiuoju su vaikų kėdute': 'e.g. travelling with a child seat', 'pvz. Vilnius, stotis': 'e.g. Vilnius, station', 'pvz. Trakai, pilis': 'e.g. Trakai, castle',

  // Filters and list sections
  'Filtruoti': 'Filter', 'Filtravimo kriterijai': 'Filter criteria', 'Uždaryti filtrus': 'Close filters', 'Min. vietų': 'Min seats', 'Bet kiek': 'Any',
  'Max kaina, €': 'Max price, €', 'Atstumas nuo manęs, km': 'Distance from me, km', 'Neribotas': 'Unlimited', 'Tik pasikartojantys': 'Recurring only', 'skelbimų': 'listings',
  'Mano pasiūlymai keleiviams': 'My offers to passengers', 'Mano skelbimai': 'My listings', 'Geriausi atitikimai': 'Best matches', 'taškų': 'points',
  'Įkelti daugiau skelbimų': 'Load more listings', 'Kol kas nėra skelbimų. Būkite pirmas, kuris pridės!': 'There are no listings yet. Be the first to add one!',
  'Pagal nurodytus kriterijus skelbimų nerasta. Pakeiskite filtravimą.': 'No listings match the selected criteria. Adjust the filters.',

  // Notifications
  'Pažymėti visus': 'Mark all as read', 'Nėra pranešimų': 'No notifications',

  // Common fragmented section labels rendered around dynamic counts
  'Gautos užklausos (': 'Received requests (', 'Mano pasiūlymai keleiviams (': 'My offers to passengers (', 'Vairuotojų pasiūlymai (': 'Driver offers (',
  'Mano užklausos (': 'My requests (', 'Mano skelbimai (': 'My listings (', 'Geriausi atitikimai (': 'Best matches ('
};

const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(\d+) vietos$/, m => `${m[1]} seats`],
  [/^(\d+) keleiviai$/, m => `${m[1]} passengers`],
  [/^(\d+) keleivis$/, m => `${m[1]} passenger`],
  [/^(\d+) skelbimų$/, m => `${m[1]} listings`],
  [/^Gautos užklausos \((\d+)\)$/, m => `Received requests (${m[1]})`],
  [/^Mano pasiūlymai keleiviams \((\d+)\)$/, m => `My offers to passengers (${m[1]})`],
  [/^Vairuotojų pasiūlymai \((\d+)\)$/, m => `Driver offers (${m[1]})`],
  [/^Mano užklausos \((\d+)\)$/, m => `My requests (${m[1]})`],
  [/^Mano skelbimai \((\d+)\)$/, m => `My listings (${m[1]})`],
  [/^Geriausi atitikimai \((\d+)\)$/, m => `Best matches (${m[1]})`],
  [/^(\d+) laukianti užklausa$/, m => `${m[1]} pending request`],
  [/^(\d+) laukiančios užklausos$/, m => `${m[1]} pending requests`],
  [/^Redaguoti skelbimą: (.*)$/, m => `Edit listing: ${m[1]}`],
  [/^Pašalinti skelbimą: (.*)$/, m => `Delete listing: ${m[1]}`],
  [/^Peržiūrėti maršrutą žemėlapyje: (.*)$/, m => `View route on map: ${m[1]}`],
  [/^Susisiekti dėl kainos: (.*)$/, m => `Contact about price: ${m[1]}`],
  [/^Pasirinkti šį skelbimą: (.*)$/, m => `Choose this listing: ${m[1]}`],
  [/^Vairuotojas siūlo tik (\d+) vietas\.$/, m => `The driver offers only ${m[1]} seats.`],
  [/^Keleivis ieško: (.*)$/, m => `Passenger is looking for: ${m[1]}`],
  [/^Iš: (.*)$/, m => `From: ${m[1]}`],
  [/^Į: (.*)$/, m => `To: ${m[1]}`],
  [/^prieš (\d+) min\.$/, m => `${m[1]} min ago`],
  [/^prieš (\d+) val\.$/, m => `${m[1]} hr ago`],
  [/^prieš (\d+) d\.$/, m => `${m[1]} d ago`]
];

const originalText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();
const attrs = ['placeholder', 'aria-label', 'title'];

function translateValue(value: string): string {
  const direct = EN[value];
  if (direct) return direct;
  for (const [re, fn] of patterns) {
    const match = value.match(re);
    if (match) return fn(match);
  }
  return value;
}

function updateText(node: Text, english: boolean) {
  const raw = originalText.get(node) ?? node.nodeValue ?? '';
  if (!originalText.has(node)) originalText.set(node, raw);
  if (!english) {
    if (node.nodeValue !== raw) node.nodeValue = raw;
    return;
  }
  const trimmed = raw.trim();
  if (!trimmed) return;
  const translated = translateValue(trimmed);
  if (translated === trimmed) return;
  const leading = raw.match(/^\s*/)?.[0] ?? '';
  const trailing = raw.match(/\s*$/)?.[0] ?? '';
  const next = `${leading}${translated}${trailing}`;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function updateElement(el: Element, english: boolean) {
  let saved = originalAttrs.get(el);
  if (!saved) {
    saved = new Map<string, string>();
    originalAttrs.set(el, saved);
  }
  for (const attr of attrs) {
    const current = el.getAttribute(attr);
    if (current !== null && !saved.has(attr)) saved.set(attr, current);
    const original = saved.get(attr);
    if (original === undefined) continue;
    const next = english ? translateValue(original) : original;
    if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
  }
}

function translateTree(root: Node, english: boolean) {
  if (root.nodeType === Node.TEXT_NODE) updateText(root as Text, english);
  if (root.nodeType === Node.ELEMENT_NODE) updateElement(root as Element, english);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) updateText(current as Text, english);
    else updateElement(current as Element, english);
    current = walker.nextNode();
  }
}

export function useUiTranslation() {
  const { isEnglish } = useLanguage();

  useEffect(() => {
    const observeOptions: MutationObserverInit = { childList: true, subtree: true, characterData: true };
    let stopped = false;
    let scheduled = false;
    const pending = new Set<Node>();

    const applySafely = (roots: Iterable<Node>) => {
      observer.disconnect();
      for (const root of roots) {
        if (root.isConnected || root === document.body) translateTree(root, isEnglish);
      }
      observer.takeRecords();
      if (!stopped) observer.observe(document.body, observeOptions);
    };

    const flush = () => {
      scheduled = false;
      if (stopped || pending.size === 0) return;
      const roots = [...pending];
      pending.clear();
      applySafely(roots);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') pending.add(mutation.target);
        for (const node of mutation.addedNodes) pending.add(node);
      }
      if (!scheduled && pending.size > 0) {
        scheduled = true;
        queueMicrotask(flush);
      }
    });

    applySafely([document.body]);

    return () => {
      stopped = true;
      pending.clear();
      observer.disconnect();
    };
  }, [isEnglish]);
}
