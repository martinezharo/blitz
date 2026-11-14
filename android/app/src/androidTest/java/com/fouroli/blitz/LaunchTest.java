package com.fouroli.blitz;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.regex.Pattern;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/** Run the actual wrapper and wait for the production web app, not just an Activity. */
@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    @Test
    public void opensBlitz() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull("Blitz must have a launcher", launch);
        context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        try {
            // A fresh emulator has no Chrome profile. Complete the first-run
            // screens as a guest instead of relying on browser command flags.
            Pattern onboarding = Pattern.compile("Use without an account|Continue without an account|No thanks|Got it|Accept & continue");
            long deadline = SystemClock.uptimeMillis() + 90_000;
            while (!device.hasObject(By.text("Words")) && SystemClock.uptimeMillis() < deadline) {
                UiObject2 next = device.wait(Until.findObject(By.text(onboarding)), 2_000);
                if (next != null) next.click();
            }
            assertTrue("The production app must open", device.hasObject(By.text("Words")));
            assertTrue("The writing page must be available", device.hasObject(By.text("Write")));
            assertTrue("The word composer must be available", device.hasObject(By.desc("Add word")) || device.hasObject(By.text("Add word")));
        } finally {
            device.takeScreenshot(new java.io.File(context.getExternalFilesDir(null), "launch.png"));
        }
    }
}
