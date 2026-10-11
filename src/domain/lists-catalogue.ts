import type { ListId, ListWord, WordList } from './lists.ts';

/**
 * Each word is written once, as a meaning with its English and German words,
 * and gives a word to each language. Both carry the English definition, and a
 * German word its translation too, so it is saved with the same fields as one
 * picked from the dictionary.
 */
interface Concept {
  en: ListWord;
  de: ListWord;
}

/** The German half of a noun: `[article, word, plural]`, with the other sex's form when it has one. */
type GermanNoun = readonly [article: string, term: string, plural: string | null, counterpart?: string];

/** `translation` is the English word, unless the German one reads better as another (Verkäufer: salesperson). */
function noun(term: string, definition: string, [article, german, plural, counterpart]: GermanNoun, translation = term): Concept {
  return {
    en: { type: 'noun', term, definition },
    de: { type: 'noun', term: german, article, plural: plural ?? undefined, counterpart, translation, definition },
  };
}

function adjective(term: string, definition: string, german: string): Concept {
  return {
    en: { type: 'adjective', term, definition },
    de: { type: 'adjective', term: german, translation: term, definition },
  };
}

function list(id: ListId, name: string, concepts: Concept[]): WordList {
  return { id, name, words: { en: concepts.map((concept) => concept.en), de: concepts.map((concept) => concept.de) } };
}

export const WORD_LISTS: readonly WordList[] = [
  list('food', 'Food', [
    noun('apple', 'A round fruit with red, green or yellow skin', ['der', 'Apfel', 'Äpfel']),
    noun('banana', 'A long, curved fruit with a yellow skin', ['die', 'Banane', 'Bananen']),
    noun('orange', 'A round citrus fruit with a thick, orange skin', ['die', 'Orange', 'Orangen']),
    noun('strawberry', 'A small, sweet, red fruit with tiny seeds on its skin', ['die', 'Erdbeere', 'Erdbeeren']),
    noun('potato', 'A starchy vegetable that grows underground', ['die', 'Kartoffel', 'Kartoffeln']),
    noun('tomato', 'A soft, round, red fruit eaten in salads and sauces', ['die', 'Tomate', 'Tomaten']),
    noun('onion', 'A round vegetable with layers that can make your eyes water', ['die', 'Zwiebel', 'Zwiebeln']),
    noun('bread', 'A baked food made from flour, water and yeast', ['das', 'Brot', 'Brote']),
    noun('cheese', 'A food made from pressed milk, in many flavours', ['der', 'Käse', 'Käse']),
    noun('egg', 'An oval food laid by a hen', ['das', 'Ei', 'Eier']),
    noun('milk', 'A white drink that comes from cows', ['die', 'Milch', null]),
    noun('butter', 'A soft, yellow fat made from cream, spread on bread', ['die', 'Butter', null]),
    noun('rice', 'Small white or brown grains that are boiled and eaten', ['der', 'Reis', null]),
    noun('meat', 'The flesh of animals, eaten as food', ['das', 'Fleisch', null]),
    noun('fish', 'An animal that lives in water, or its flesh eaten as food', ['der', 'Fisch', 'Fische']),
    noun('cake', 'A sweet baked food, often eaten at birthdays', ['der', 'Kuchen', 'Kuchen']),
  ]),
  list('colours', 'Colours', [
    adjective('red', 'The colour of blood or a ripe tomato', 'rot'),
    adjective('blue', 'The colour of a clear sky', 'blau'),
    adjective('green', 'The colour of grass and leaves', 'grün'),
    adjective('yellow', 'The colour of a lemon or the sun', 'gelb'),
    adjective('black', 'The colour of coal or the night sky', 'schwarz'),
    adjective('white', 'The colour of snow or milk', 'weiß'),
    adjective('grey', 'The colour between black and white, like storm clouds', 'grau'),
    adjective('brown', 'The colour of chocolate or soil', 'braun'),
    adjective('orange', 'The colour between red and yellow, like the fruit', 'orange'),
    adjective('pink', 'A pale red, like candyfloss', 'rosa'),
    adjective('purple', 'The colour between blue and red, like a plum', 'lila'),
  ]),
  list('body', 'Body', [
    noun('head', 'The top part of the body, with the brain, eyes and mouth', ['der', 'Kopf', 'Köpfe']),
    noun('face', 'The front of the head', ['das', 'Gesicht', 'Gesichter']),
    noun('eye', 'The part of the body you see with', ['das', 'Auge', 'Augen']),
    noun('ear', 'The part of the body you hear with', ['das', 'Ohr', 'Ohren']),
    noun('nose', 'The part of the face you smell with', ['die', 'Nase', 'Nasen']),
    noun('mouth', 'The opening in the face used to eat and speak', ['der', 'Mund', 'Münder']),
    noun('tooth', 'One of the hard white parts in the mouth used to bite and chew', ['der', 'Zahn', 'Zähne']),
    noun('neck', 'The part of the body that joins the head to the shoulders', ['der', 'Hals', 'Hälse']),
    noun('shoulder', 'The part of the body between the neck and the arm', ['die', 'Schulter', 'Schultern']),
    noun('arm', 'The long limb between the shoulder and the hand', ['der', 'Arm', 'Arme']),
    noun('hand', 'The part at the end of the arm, with fingers', ['die', 'Hand', 'Hände']),
    noun('finger', 'One of the long, thin parts at the end of the hand', ['der', 'Finger', 'Finger']),
    noun('belly', 'The front part of the body below the chest', ['der', 'Bauch', 'Bäuche']),
    noun('back', 'The rear part of the body, from the neck to the waist', ['der', 'Rücken', 'Rücken']),
    noun('leg', 'The long limb you walk on', ['das', 'Bein', 'Beine']),
    noun('knee', 'The joint in the middle of the leg', ['das', 'Knie', 'Knie']),
    noun('foot', 'The part at the end of the leg that you stand on', ['der', 'Fuß', 'Füße']),
    noun('heart', 'The organ that pumps blood around the body', ['das', 'Herz', 'Herzen']),
  ]),
  list('jobs', 'Jobs', [
    noun('teacher', 'A person whose job is to teach at a school', ['der', 'Lehrer', 'Lehrer', 'Lehrerin']),
    noun('doctor', 'A person trained to treat people who are sick or hurt', ['der', 'Arzt', 'Ärzte', 'Ärztin']),
    noun('cook', 'A person whose job is to prepare and cook food', ['der', 'Koch', 'Köche', 'Köchin']),
    noun('baker', 'A person who makes and sells bread and cakes', ['der', 'Bäcker', 'Bäcker', 'Bäckerin']),
    noun('police officer', 'A person whose job is to enforce the law and protect people', ['der', 'Polizist', 'Polizisten', 'Polizistin']),
    noun('shop assistant', 'A person who sells things in a shop', ['der', 'Verkäufer', 'Verkäufer', 'Verkäuferin'], 'salesperson'),
    noun('engineer', 'A person who designs and builds machines, roads or buildings', ['der', 'Ingenieur', 'Ingenieure', 'Ingenieurin']),
    noun('hairdresser', 'A person who cuts and styles hair', ['der', 'Friseur', 'Friseure', 'Friseurin']),
    noun('waiter', 'A person who brings food and drinks to your table in a restaurant', ['der', 'Kellner', 'Kellner', 'Kellnerin']),
    noun('lawyer', 'A person trained to give legal advice and speak for people in court', ['der', 'Anwalt', 'Anwälte', 'Anwältin']),
    noun('pilot', 'A person who flies an aircraft', ['der', 'Pilot', 'Piloten', 'Pilotin']),
    noun('actor', 'A person who plays a role in a play or film', ['der', 'Schauspieler', 'Schauspieler', 'Schauspielerin']),
  ]),
];
