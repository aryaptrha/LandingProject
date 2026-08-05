export interface AvengerAvatarInfo {
  id: string
  name: string
  heroName: string
  badgeColor: string
}

export const AVENGERS_AVATARS: AvengerAvatarInfo[] = [
  { id: 'ironman', name: 'Iron Man', heroName: 'Armored Hero', badgeColor: '#C0392B' },
  { id: 'cap', name: 'Captain America', heroName: 'First Avenger', badgeColor: '#2980B9' },
  { id: 'thor', name: 'Thor', heroName: 'God of Thunder', badgeColor: '#F39C12' },
  { id: 'hulk', name: 'Hulk', heroName: 'Gamma Power', badgeColor: '#27AE60' },
  { id: 'spiderman', name: 'Spider-Man', heroName: 'Web Slinger', badgeColor: '#E74C3C' },
  { id: 'blackwidow', name: 'Black Widow', heroName: 'Master Agent', badgeColor: '#D35400' },
  { id: 'blackpanther', name: 'Black Panther', heroName: 'King of Wakanda', badgeColor: '#8E44AD' },
  { id: 'drstrange', name: 'Doctor Strange', heroName: 'Sorcerer Supreme', badgeColor: '#2980B9' },
  { id: 'groot', name: 'Groot', heroName: 'Flora Colossus', badgeColor: '#7D6608' },
]
