package com.fouroli.blitz;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/** Run the actual wrapper and wait for the production web app, not just an Activity. */
@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    @Test
    public void opensBlitz() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        // A fresh CI emulator has no browser profile. Skip Chrome's onboarding.
        device.executeShellCommand("am set-debug-app --persistent com.android.chrome");
        device.executeShellCommand("sh -c \"echo 'chrome --disable-fre --no-first-run --no-default-browser-check' > /data/local/tmp/chrome-command-line\"");
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull("Blitz must have a launcher", launch);
        context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        try {
            assertTrue("The production app must open", device.wait(Until.hasObject(By.text("Words")), 60_000));
            assertTrue("The writing page must be available", device.hasObject(By.text("Write")));
            assertTrue("The word composer must be available", device.hasObject(By.desc("Add word")) || device.hasObject(By.text("Add word")));
        } finally {
            device.takeScreenshot(new java.io.File(context.getExternalFilesDir(null), "launch.png"));
        }
    }
}
