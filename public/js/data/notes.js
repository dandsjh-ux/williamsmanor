// The 12 notes. `id` is the true order (the answer for the deduction board) and is
// never shown to players: the journal lists notes in the order they were found.
// Text is word for word from the spec. Note 8 must keep the misspelling "Melisa Reese".

export const NOTES = [
  {
    id: 1,
    title: 'The Umbrella',
    text: "It was raining so hard on my way home from school that I could barely see the road. A man with a black umbrella was standing by the big iron gates. He said I could wait inside until the storm passed. His voice was soft and polite. He gave me a warm drink that tasted of honey and something...metallic. After that, I don't remember anything.",
  },
  {
    id: 2,
    title: 'Painted Birds',
    text: 'I woke up in a room with yellow wallpaper covered in tiny painted birds. The window is boarded up. There is no handle on the inside of the door. My bag is gone and so is my phone. I scratched one line on the wall behind the bed so I can count the days. One line. Someone will come for me.',
  },
  {
    id: 3,
    title: 'The White Dress',
    text: "Two lines on the wall now. He brought me soup on a silver tray and called me his little bird. Then he asked me to wear a white dress. When I said no, he didn't shout. He just stood very still and smiled until I put it on. That was worse than shouting.",
  },
  {
    id: 4,
    title: 'The Music Box',
    text: "Three lines. Today he gave me a music box with a tiny dancer that spins when you wind it. The song is slow and sad. He said it belonged to his mother and that she would have liked me. I play it over and over so I don't have to hear his footsteps outside my door.",
  },
  {
    id: 5,
    title: 'Voices Downstairs',
    text: 'Five lines. Last night I pressed my ear to the floor and heard him arguing with someone he called Father. But nobody ever answered. The only other sound was the grandfather clock. When it struck twelve, he stopped talking and went to wind it. It takes him a long time. For those minutes, nobody is watching my door.',
  },
  {
    id: 6,
    title: 'The Dancer',
    text: "Six lines. The music box broke today. I wound it too tightly and the little dancer snapped off. He held the broken pieces like a dead bird and cried. Then he went silent and stopped bringing food. My stomach hurts. I keep the dancer in my pocket so he can't have her.",
  },
  {
    id: 7,
    title: 'The Long Hole',
    text: "Seven lines. He hasn't spoken to me since the music box broke. Through a crack in the boards over the window, I can see the garden. This morning he was digging a long, deep hole beside the rose bushes. When he saw me watching, he smiled and waved. I don't want to be here when he finishes.",
  },
  {
    id: 8,
    title: 'The Hairpin',
    text: 'Nine lines. I found a loose floorboard under the bed and hid a hairpin inside it. Tonight there is a full moon, so I will be able to see the stairs. When the clock strikes twelve and he goes down to wind it, I will run. If anyone finds this, my name is Melisa Reese and I am going home.',
  },
  {
    id: 9,
    title: 'Midnight',
    text: 'The hairpin worked. The lock clicked open and my heart was beating so loudly I was sure he could hear it. I ran down the hallway in bare feet, past the portraits with their staring eyes. The clock began to strike. One. Two. Three. At the top of the great staircase, I looked down. He was standing at the bottom, waiting.',
  },
  {
    id: 10,
    title: 'The Stairs',
    text: 'I ran away, as fast as I can but I slipped down the stairs. It hurt. I felt something warm, and I felt my broken neck and bleeding skull. I stopped breathing and stared into his eyes. I looked so peaceful.',
  },
  {
    id: 11,
    title: 'Thirty-Seven',
    text: 'He carried me down to the cellar. He was so gentle, as if I were made of glass. He said sorry thirty-seven times. I counted every single one. Then he sat with me all night and brushed my hair, even though my eyes would not close.',
  },
  {
    id: 12,
    title: 'White Roses',
    text: "The next morning, he put me in the long hole he dug when the music box broke. I'm not cold anymore. I'm not hungry anymore. He planted white roses on top of me, and every evening he sits beside them and reads to me. Tonight he read my favourite book. Then he left me and left for his safe place between the walls.",
  },
];

export const noteById = (id) => NOTES.find((n) => n.id === id);

// For the results screen: the words that place each note in order (clues), and the
// words that give the real author away (tells).
export const EVIDENCE = {
  1: { clues: ['on my way home from school'], why: 'The first night, on her way home.' },
  2: { clues: ['One line.'], why: 'One line on the wall.' },
  3: { clues: ['Two lines'], why: 'Two lines.' },
  4: { clues: ['Three lines.', 'a music box'], why: 'Three lines, and the music box still works.' },
  5: { clues: ['Five lines.', 'When it struck twelve'], why: 'Five lines. It sets up the midnight escape.' },
  6: { clues: ['Six lines.', 'The music box broke today'], why: 'Six lines. The music box breaks.' },
  7: { clues: ['Seven lines.', 'since the music box broke'], why: 'Seven lines, after the music box broke.' },
  8: { clues: ['Nine lines.', 'Tonight'], tells: ['Melisa Reese'], why: 'Nine lines, and the plan is for tonight.', tell: 'She spells her own name wrong. Her mother said Melissa never would, and the newspaper spells it correctly.' },
  9: { clues: ['The hairpin worked.'], why: 'It carries out the plan from the hairpin note.' },
  10: { clues: ['I slipped down the stairs'], tells: ['I stopped breathing', 'I looked so peaceful'], why: 'It follows straight on from the escape.', tell: 'She describes her own death, and sees her own face from the outside.' },
  11: { clues: ['He carried me down to the cellar.'], tells: ['I counted every single one'], why: 'The same night as the fall.', tell: 'She is still counting after she has died. The number, 37, opens Steven\'s ledger.' },
  12: { clues: ['The next morning', 'the long hole he dug when the music box broke'], tells: ['left for his safe place between the walls'], why: 'The next morning, using the hole from the Long Hole note.', tell: 'She watches him leave after she is buried. Only the person who wrote it could know that.' },
};

/** The first sentence of a note: what a torn fragment still shows. */
export function firstLine(text) {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
