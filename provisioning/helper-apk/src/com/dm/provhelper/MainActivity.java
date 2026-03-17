package com.dm.provhelper;

import android.app.Activity;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;

/**
 * Debug-only activity for manual testing via adb.
 * Directly schedules the provisioning job.
 */
public class MainActivity extends Activity {
    private static final String TAG = "ProvHelper";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "Manual trigger — scheduling provision job directly");

        JobScheduler scheduler = (JobScheduler) getSystemService(Context.JOB_SCHEDULER_SERVICE);
        JobInfo jobInfo = new JobInfo.Builder(ProvisionReceiver.JOB_ID,
                new ComponentName(this, ProvisionJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setOverrideDeadline(0) // run immediately
                .build();

        int result = scheduler.schedule(jobInfo);
        Log.i(TAG, "Job scheduled: " + (result == JobScheduler.RESULT_SUCCESS ? "OK" : "FAILED"));

        finish();
    }
}
