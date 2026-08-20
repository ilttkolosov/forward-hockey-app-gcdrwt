export interface MessengerPresetAvatar {
  id: string;
  title: string;
  source: number;
}

export const MESSENGER_PRESET_AVATARS: readonly MessengerPresetAvatar[] = [
  { id: "lion-coach", title: "Мудрый лев", source: require("../../assets/messenger/preset-avatars/lion-coach.png") },
  { id: "tiger", title: "Тигр", source: require("../../assets/messenger/preset-avatars/tiger.png") },
  { id: "penguin", title: "Весёлый пингвин", source: require("../../assets/messenger/preset-avatars/penguin.png") },
  { id: "beaver", title: "Сильный бобёр", source: require("../../assets/messenger/preset-avatars/beaver.png") },
  { id: "fox", title: "Лисица", source: require("../../assets/messenger/preset-avatars/fox.png") },
  { id: "owl-parent", title: "Сова", source: require("../../assets/messenger/preset-avatars/owl-parent.png") },
  { id: "lynx", title: "Рысь", source: require("../../assets/messenger/preset-avatars/lynx.png") },
  { id: "bear", title: "Медведь", source: require("../../assets/messenger/preset-avatars/bear.png") },
  { id: "badger", title: "Барсук", source: require("../../assets/messenger/preset-avatars/badger.png") },
  { id: "wolf", title: "Волк", source: require("../../assets/messenger/preset-avatars/wolf.png") },
  { id: "raccoon", title: "Енот", source: require("../../assets/messenger/preset-avatars/raccoon.png") },
  { id: "owl", title: "Сова в шапке", source: require("../../assets/messenger/preset-avatars/owl.png") },
] as const;
