import type { ListId } from './lists.ts';

/**
 * What the ready-made lists hold, without the definitions: each meaning with its
 * English word and its German one. `pnpm lists` writes the definitions
 * (lists-definitions.json) from the curated dictionary, and lists-catalogue.ts
 * puts the two together.
 */

export type Concept =
  | { type: 'noun'; en: string; de: { article: string; term: string; plural: string | null; counterpart?: string }; translation?: string }
  | { type: 'adjective'; en: string; de: { term: string } };

export const LIST_CONCEPTS: readonly { id: ListId; name: string; concepts: Concept[] }[] = [
  {
    id: 'food',
    name: 'Food',
    concepts: [
      { type: 'noun', en: 'apple', de: { article: 'der', term: 'Apfel', plural: 'Äpfel' } },
      { type: 'noun', en: 'banana', de: { article: 'die', term: 'Banane', plural: 'Bananen' } },
      { type: 'noun', en: 'orange', de: { article: 'die', term: 'Orange', plural: 'Orangen' } },
      { type: 'noun', en: 'strawberry', de: { article: 'die', term: 'Erdbeere', plural: 'Erdbeeren' } },
      { type: 'noun', en: 'potato', de: { article: 'die', term: 'Kartoffel', plural: 'Kartoffeln' } },
      { type: 'noun', en: 'tomato', de: { article: 'die', term: 'Tomate', plural: 'Tomaten' } },
      { type: 'noun', en: 'onion', de: { article: 'die', term: 'Zwiebel', plural: 'Zwiebeln' } },
      { type: 'noun', en: 'bread', de: { article: 'das', term: 'Brot', plural: 'Brote' } },
      { type: 'noun', en: 'cheese', de: { article: 'der', term: 'Käse', plural: 'Käse' } },
      { type: 'noun', en: 'egg', de: { article: 'das', term: 'Ei', plural: 'Eier' } },
      { type: 'noun', en: 'milk', de: { article: 'die', term: 'Milch', plural: null } },
      { type: 'noun', en: 'butter', de: { article: 'die', term: 'Butter', plural: null } },
      { type: 'noun', en: 'rice', de: { article: 'der', term: 'Reis', plural: null } },
      { type: 'noun', en: 'meat', de: { article: 'das', term: 'Fleisch', plural: null } },
      { type: 'noun', en: 'fish', de: { article: 'der', term: 'Fisch', plural: 'Fische' } },
      { type: 'noun', en: 'cake', de: { article: 'der', term: 'Kuchen', plural: 'Kuchen' } },
    ],
  },
  {
    id: 'colours',
    name: 'Colours',
    concepts: [
      { type: 'adjective', en: 'red', de: { term: 'rot' } },
      { type: 'adjective', en: 'blue', de: { term: 'blau' } },
      { type: 'adjective', en: 'green', de: { term: 'grün' } },
      { type: 'adjective', en: 'yellow', de: { term: 'gelb' } },
      { type: 'adjective', en: 'black', de: { term: 'schwarz' } },
      { type: 'adjective', en: 'white', de: { term: 'weiß' } },
      { type: 'adjective', en: 'grey', de: { term: 'grau' } },
      { type: 'adjective', en: 'brown', de: { term: 'braun' } },
      { type: 'adjective', en: 'orange', de: { term: 'orange' } },
      { type: 'adjective', en: 'pink', de: { term: 'rosa' } },
      { type: 'adjective', en: 'purple', de: { term: 'lila' } },
    ],
  },
  {
    id: 'body',
    name: 'Body',
    concepts: [
      { type: 'noun', en: 'head', de: { article: 'der', term: 'Kopf', plural: 'Köpfe' } },
      { type: 'noun', en: 'face', de: { article: 'das', term: 'Gesicht', plural: 'Gesichter' } },
      { type: 'noun', en: 'eye', de: { article: 'das', term: 'Auge', plural: 'Augen' } },
      { type: 'noun', en: 'ear', de: { article: 'das', term: 'Ohr', plural: 'Ohren' } },
      { type: 'noun', en: 'nose', de: { article: 'die', term: 'Nase', plural: 'Nasen' } },
      { type: 'noun', en: 'mouth', de: { article: 'der', term: 'Mund', plural: 'Münder' } },
      { type: 'noun', en: 'tooth', de: { article: 'der', term: 'Zahn', plural: 'Zähne' } },
      { type: 'noun', en: 'neck', de: { article: 'der', term: 'Hals', plural: 'Hälse' } },
      { type: 'noun', en: 'shoulder', de: { article: 'die', term: 'Schulter', plural: 'Schultern' } },
      { type: 'noun', en: 'arm', de: { article: 'der', term: 'Arm', plural: 'Arme' } },
      { type: 'noun', en: 'hand', de: { article: 'die', term: 'Hand', plural: 'Hände' } },
      { type: 'noun', en: 'finger', de: { article: 'der', term: 'Finger', plural: 'Finger' } },
      { type: 'noun', en: 'belly', de: { article: 'der', term: 'Bauch', plural: 'Bäuche' } },
      { type: 'noun', en: 'back', de: { article: 'der', term: 'Rücken', plural: 'Rücken' } },
      { type: 'noun', en: 'leg', de: { article: 'das', term: 'Bein', plural: 'Beine' } },
      { type: 'noun', en: 'knee', de: { article: 'das', term: 'Knie', plural: 'Knie' } },
      { type: 'noun', en: 'foot', de: { article: 'der', term: 'Fuß', plural: 'Füße' } },
      { type: 'noun', en: 'heart', de: { article: 'das', term: 'Herz', plural: 'Herzen' } },
    ],
  },
  {
    id: 'jobs',
    name: 'Jobs',
    concepts: [
      { type: 'noun', en: 'teacher', de: { article: 'der', term: 'Lehrer', plural: 'Lehrer', counterpart: 'Lehrerin' } },
      { type: 'noun', en: 'doctor', de: { article: 'der', term: 'Arzt', plural: 'Ärzte', counterpart: 'Ärztin' } },
      { type: 'noun', en: 'cook', de: { article: 'der', term: 'Koch', plural: 'Köche', counterpart: 'Köchin' } },
      { type: 'noun', en: 'baker', de: { article: 'der', term: 'Bäcker', plural: 'Bäcker', counterpart: 'Bäckerin' } },
      { type: 'noun', en: 'police officer', de: { article: 'der', term: 'Polizist', plural: 'Polizisten', counterpart: 'Polizistin' } },
      { type: 'noun', en: 'shop assistant', de: { article: 'der', term: 'Verkäufer', plural: 'Verkäufer', counterpart: 'Verkäuferin' }, translation: 'salesperson' },
      { type: 'noun', en: 'engineer', de: { article: 'der', term: 'Ingenieur', plural: 'Ingenieure', counterpart: 'Ingenieurin' } },
      { type: 'noun', en: 'hairdresser', de: { article: 'der', term: 'Friseur', plural: 'Friseure', counterpart: 'Friseurin' } },
      { type: 'noun', en: 'waiter', de: { article: 'der', term: 'Kellner', plural: 'Kellner', counterpart: 'Kellnerin' } },
      { type: 'noun', en: 'lawyer', de: { article: 'der', term: 'Anwalt', plural: 'Anwälte', counterpart: 'Anwältin' } },
      { type: 'noun', en: 'pilot', de: { article: 'der', term: 'Pilot', plural: 'Piloten', counterpart: 'Pilotin' } },
      { type: 'noun', en: 'actor', de: { article: 'der', term: 'Schauspieler', plural: 'Schauspieler', counterpart: 'Schauspielerin' } },
    ],
  },
];
