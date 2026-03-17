package com.dm.provhelper;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Triggered on BOOT_COMPLETED and MY_PACKAGE_REPLACED.
 * Schedules the provisioning job if not already done.
 */
public class ProvisionReceiver extends BroadcastReceiver {
    private static final String TAG = "ProvHelper";
    static final int JOB_ID = 1001;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "null";
        Log.i(TAG, "ProvisionReceiver fired: " + action);

        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);

        // Don't schedule if already pending
        for (JobInfo job : scheduler.getAllPendingJobs()) {
            if (job.getId() == JOB_ID) {
                Log.i(TAG, "Provision job already scheduled, skipping");
                return;
            }
        }

        JobInfo jobInfo = new JobInfo.Builder(JOB_ID,
                new ComponentName(context, ProvisionJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(60_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL) // 1min initial backoff
                .build();

        int result = scheduler.schedule(jobInfo);
        Log.i(TAG, "Provision job scheduled: " + (result == JobScheduler.RESULT_SUCCESS ? "OK" : "FAILED"));
    }
}
