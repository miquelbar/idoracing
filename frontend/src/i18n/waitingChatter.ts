import { useEffect, useState } from 'react';
import type { Language } from './index';

/**
 * Radio calls from Pep while the answer is still being worked out: the engineer speaking to the driver,
 * first person, serious, with short orders.
 *
 * Each call is built from three interchangeable pieces (what Pep is doing, about which topic, what he asks
 * of the driver), so every language has well over 10,000 distinct, grammatical lines without storing them
 * one by one.
 */
interface Pieces {
  openers: string[];
  topics: string[];
  tails: string[];
}

const PIECES: Record<Language, Pieces> = {
  es: {
    openers: [
      'Dame unos segundos, estoy revisando',
      'Un momento, piloto: estoy cruzando',
      'Recibido. Estoy comparando',
      'Sigo en ello, ahora mismo analizo',
      'Piloto, mantén la calma: estoy mirando',
      'Copiado. Estoy contrastando',
      'Un segundo más, estoy revisando a fondo',
      'Atento a la radio, estoy repasando',
      'Dame un momento, estoy verificando',
      'Estoy cotejando con la referencia',
      'Ahora mismo estoy estudiando',
      'Dame un respiro, estoy comprobando',
      'Sigo con el análisis, estoy mirando',
      'Espera mi llamada, estoy consultando',
      'Piloto, no te desconcentres: estoy afinando',
      'Todavía estoy leyendo',
      'Un momento, estoy desglosando',
      'Estoy poniendo en orden',
      'Dame un segundo, estoy midiendo',
      'Sigue a lo tuyo, yo estoy repasando',
      'Un instante, piloto: estoy revisando punto por punto',
      'Estoy siguiendo en la gráfica',
      'Aguanta un momento, estoy examinando',
      'Ya casi: estoy terminando de revisar',
    ],
    topics: [
      'la presión de los neumáticos delanteros',
      'tu punto de frenada',
      'la apertura del gas a la salida',
      'el trail braking de la entrada',
      'la velocidad mínima en el vértice',
      'la temperatura de los frenos',
      'el reparto de frenada',
      'la trazada por el interior',
      'el uso de los pianos',
      'la marcha elegida en el vértice',
      'el ángulo de volante',
      'el delta de tiempo acumulado',
      'la estabilidad de la zaga',
      'el desgaste de la goma',
      'la transición del freno al gas',
      'el consumo de combustible',
      'la carga aerodinámica',
      'el comportamiento del diferencial',
      'las trazas de acelerador y freno',
      'la velocidad de entrada',
      'el equilibrio entre eje delantero y trasero',
      'la última vuelta de referencia',
    ],
    tails: [
      'Mantente concentrado, enseguida te respondo.',
      'Sigue en pista con calma, enseguida tengo la respuesta.',
      'No cambies nada todavía.',
      'Respira y mantén el ritmo, ya casi lo tengo.',
      'Dame un momento más, quiero estar seguro del dato.',
      'Cuando termine te doy un ejercicio concreto para la siguiente tanda.',
      'No toques el reglaje: es el mismo en las dos vueltas.',
      'Atento a la radio, enseguida te llamo.',
      'Prefiero confirmar el dato antes de darte la corrección.',
      'Los números mandan, así que no me precipito.',
      'Te contesto en cuanto cierre el análisis.',
      'Mantén la cabeza fría: la mejora está en los datos.',
      'Ahora te digo dónde está el tiempo.',
      'Tú piensa en la siguiente frenada.',
      'Un poco de paciencia, mejor hacerlo bien.',
      'No te adelantes: primero los datos, luego la corrección.',
      'Mantén la vista en la pista, yo me ocupo de la telemetría.',
      'Te paso el diagnóstico en cuanto lo tenga cerrado.',
      'Sin prisa, piloto: quiero darte algo que puedas aplicar ya.',
      'Cuando te llame, tendrás una cosa clara que cambiar.',
      'Concéntrate en la próxima vuelta, enseguida estoy contigo.',
      'Confía en el proceso: te daré una sola prioridad.',
    ],
  },
  en: {
    openers: [
      'Give me a few seconds, I am reviewing',
      'Hold on, driver: I am cross-checking',
      'Copy that. I am comparing',
      'Still on it, I am analysing',
      'Stay calm, driver: I am looking at',
      'Copy. I am going through',
      'One more second, I am digging into',
      'Keep listening, I am going over',
      'Give me a moment, I am verifying',
      'I am cross-referencing',
      'Right now I am studying',
      'Give me some room, I am checking',
      'The analysis is running, I am looking at',
      'Wait for my call, I am consulting',
      'Driver, stay focused: I am fine-tuning my read on',
      'I am still reading',
      'One moment, I am breaking down',
      'I am putting in order',
      'Give me a second, I am measuring',
      'You keep driving, I am going over',
      'One moment, driver: I am reviewing, point by point,',
      'On the chart I am looking at',
      'Hang on, I am examining',
      'Almost there: I am finishing the review of',
    ],
    topics: [
      'the front tyre pressures',
      'your braking point',
      'the throttle pick-up on exit',
      'the trail braking on entry',
      'the minimum speed at the apex',
      'the brake temperatures',
      'the brake bias',
      'the line through the inside',
      'the use of the kerbs',
      'the gear picked at the apex',
      'the steering angle',
      'the accumulated time delta',
      'the stability of the rear axle',
      'the tyre wear',
      'the brake-to-throttle transition',
      'the fuel consumption',
      'the aero load',
      'the differential behaviour',
      'the throttle and brake traces',
      'the entry speed',
      'the balance between front and rear axle',
      'the last reference lap',
    ],
    tails: [
      'Stay focused, I will come back to you shortly.',
      'Keep driving smoothly, I will have the answer soon.',
      'Do not change anything yet.',
      'Breathe and keep the rhythm, I almost have it.',
      'Give me one more moment, I want to be sure of the number.',
      'When I am done I will give you one concrete drill for the next run.',
      'Do not touch the setup: it is the same on both laps.',
      'Stay on the radio, I will call you shortly.',
      'I prefer to confirm the data before giving you the correction.',
      'The numbers rule, so I am not rushing.',
      'I will answer as soon as the analysis is closed.',
      'Keep a cool head: the gain is in the data.',
      'I will tell you in a moment where the time is.',
      'You think about the next braking zone.',
      'A little patience, better to do it right.',
      'Do not get ahead of yourself: data first, correction second.',
      'Keep your eyes on the track, I will handle the telemetry.',
      'I will send you the diagnosis as soon as it is settled.',
      'No rush, driver: I want to give you something you can apply right away.',
      'When I call you, there will be one clear thing to change.',
      'Focus on the next lap, I will be with you shortly.',
      'Trust the process: I will give you a single priority.',
    ],
  },
};

export const CHATTER_INTERVAL_MS = 10_000;

export function chatterCount(lang: Language): number {
  const { openers, topics, tails } = PIECES[lang];
  return openers.length * topics.length * tails.length;
}

/** One random radio call; never the same as `previous`. */
export function randomChatter(lang: Language, previous?: string | null): string {
  const { openers, topics, tails } = PIECES[lang];
  const pick = (items: string[]) => items[Math.floor(Math.random() * items.length)];
  let line = '';
  do {
    line = `${pick(openers)} ${pick(topics)}. ${pick(tails)}`;
  } while (line === previous);
  return line;
}

/**
 * While `active`, returns a fresh random line every 10 s (null until the first one is due, so the caller can
 * show its normal "thinking" text at first).
 */
export function useWaitingChatter(active: boolean, lang: Language): string | null {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setLine((previous) => randomChatter(lang, previous)), CHATTER_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      setLine(null);
    };
  }, [active, lang]);

  return line;
}
