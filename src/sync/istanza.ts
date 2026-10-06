// L'unico motore di sincronizzazione dell'app, collegato al database locale e al client Plexus vero.
import { db } from '../dati/db'
import { MotoreSincronizzazione } from './motore'

export const motore = new MotoreSincronizzazione(db)
