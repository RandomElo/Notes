package fr.eloi.notes.memos

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import fr.eloi.notes.MainActivity
import fr.eloi.notes.R

/**
 * Service de premier plan qui garde le micro écran éteint ou application
 * quittée (choix d'Eloi, 2026-10-11). Il ne fait qu'afficher la notification
 * « Enregistrement en cours », dont le bouton « Terminer » range le mémo ;
 * l'enregistrement lui-même est dans `Recording`.
 */
class RecordingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_TERMINER) {
            Recording.terminer(this, signaler = true)
            arreter()
            return START_NOT_STICKY
        }
        if (!Recording.enCours()) {
            arreter()
            return START_NOT_STICKY
        }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
        ServiceCompat.startForeground(this, NOTIFICATION, notification(), type)
        return START_NOT_STICKY
    }

    private fun arreter() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun notification(): Notification {
        val gestionnaire = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Importance normale, sans son : en « silencieuse », Android replie la notification et cache « Terminer ».
            gestionnaire.createNotificationChannel(NotificationChannel(CANAL, "Enregistrement des mémos", NotificationManager.IMPORTANCE_DEFAULT).apply { setSound(null, null) })
        }
        val ouvrir = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val terminer = PendingIntent.getService(
            this, 1,
            Intent(this, RecordingService::class.java).setAction(ACTION_TERMINER),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_micro)
            .setContentTitle("Enregistrement en cours")
            .setContentText("Mémo vocal, envoyé sur le NAS une fois terminé.")
            .setUsesChronometer(true)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(ouvrir)
            .addAction(0, "Terminer", terminer)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        // Un canal créé garde son importance : nouveau nom quand elle change.
        private const val CANAL = "memos-enregistrement"
        private const val NOTIFICATION = 1
        private const val ACTION_TERMINER = "fr.eloi.notes.memos.TERMINER"

        fun lancer(context: Context) {
            androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, RecordingService::class.java))
        }

        /** Retire la notification quand le mémo est terminé ou annulé depuis l'application. */
        fun arreter(context: Context) {
            context.stopService(Intent(context, RecordingService::class.java))
        }
    }
}
