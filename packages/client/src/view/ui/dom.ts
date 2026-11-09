import { iconInfo, type IconName } from '../../assets/pixelArt';
import { paintSprites } from './sprites';

/** Échappe un texte avant de l'insérer dans du HTML (pseudos et noms de salon viennent des joueurs). */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Crée un élément à partir d'un fragment HTML. */
export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as T;
}

/** Remplace le contenu d'un élément par du HTML et dessine les sprites qu'il contient. */
export function setHtml(target: HTMLElement, html: string): void {
  target.innerHTML = html;
  fillIcons(target);
  paintSprites(target);
}

/** Image HTML d'une icône pixel, agrandie `scale` fois. */
export function iconHtml(name: IconName, scale = 3): string {
  const info = iconInfo(name);
  return `<img class="ico" src="${info.url}" width="${info.w * scale}" height="${info.h * scale}" alt="" />`;
}

/** Remplace les `<span data-icon="nom" data-s="échelle">` d'un conteneur par l'icône correspondante. */
export function fillIcons(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => {
    node.innerHTML = iconHtml(node.dataset.icon as IconName, Number(node.dataset.s) || 3);
    delete node.dataset.icon;
  });
}

/** Chronomètre `m:ss` à partir de millisecondes. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
