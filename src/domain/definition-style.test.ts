import { describe, expect, it } from 'vitest';
import { checkDefinition, DEFINITION_STYLE, definitionProblems } from './definition-style.ts';

describe('definitionProblems', () => {
  it('finds a definition that uses the word it defines', () => {
    expect(definitionProblems('phone', [], 'To call someone using a phone')).toEqual(['uses "phone"']);
    expect(definitionProblems('Tänzerin', ['dancer'], 'A woman who dances as a job or hobby')).toEqual(['uses "dancer"']);
  });

  it('finds one that uses the main translation, or a word of the same family', () => {
    expect(definitionProblems('malen', ['to paint', 'to draw'], 'To make a picture using paint')).toEqual(['uses "paint"']);
    expect(definitionProblems('Spieler', ['player'], 'A person who plays a game or sport')).toEqual(['uses "player"']);
  });

  it('lets a definition use the other words of a long translation, and short words that only look alike', () => {
    expect(definitionProblems('Lungenkrebs', ['lung cancer'], 'A serious disease in which harmful cells grow in the lungs')).toEqual([]);
    expect(definitionProblems('an', ['at'], 'A word that shows where something is')).toEqual([]);
    expect(definitionProblems('Mund', ['mouth'], 'An opening in the face used for eating and speaking')).toEqual([]);
  });

  it('finds one that is longer than it was asked to be', () => {
    expect(definitionProblems('zeitlich', ['temporary'], `Describes something that concerns ${'x'.repeat(40)}`)).toEqual(['74 characters']);
  });
});

describe('checkDefinition', () => {
  it('tidies spaces and a full stop', () => {
    expect(checkDefinition('  A tool for   cutting paper.  ')).toEqual({ definition: 'A tool for cutting paper' });
  });

  it('says what is wrong with one a learner could not use', () => {
    expect(checkDefinition('')).toHaveProperty('problem');
    expect(checkDefinition('No')).toHaveProperty('problem');
    expect(checkDefinition('x'.repeat(90))).toHaveProperty('problem');
    expect(checkDefinition('A thing (of some kind)')).toHaveProperty('problem');
    expect(checkDefinition('a thing in lowercase')).toHaveProperty('problem');
    expect(checkDefinition(42)).toHaveProperty('problem');
  });
});

describe('DEFINITION_STYLE', () => {
  it('tells the models the length the checks go by', () => {
    expect(DEFINITION_STYLE).toContain('at most 70 characters');
  });
});
