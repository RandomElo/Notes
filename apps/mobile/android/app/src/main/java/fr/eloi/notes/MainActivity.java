package fr.eloi.notes;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import fr.eloi.notes.memos.RecorderPlugin;
import fr.eloi.notes.secrets.SecretsPlugin;
import fr.eloi.notes.smb.SmbPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propres à Notes : client SMB (smbj), coffre du mot de passe (Android Keystore), mémos vocaux.
        registerPlugin(SmbPlugin.class);
        registerPlugin(SecretsPlugin.class);
        registerPlugin(RecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
