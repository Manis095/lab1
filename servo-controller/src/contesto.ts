import { GestoreSeriale } from './seriale';
import { Bus } from './bus';

export const seriale = new GestoreSeriale();
export const bus = new Bus(seriale);

const logDiv = document.getElementById('log') as HTMLDivElement;

export function scriviLog(messaggio: string) {
    const orario = new Date().toLocaleTimeString();
    logDiv.textContent += `\n[${orario}] ${messaggio}`;
    logDiv.scrollTop = logDiv.scrollHeight;
}