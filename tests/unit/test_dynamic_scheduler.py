"""Tests for DynamicNPUScheduler (Rockchip RK3588 Tri-Core Auto-Sharding)."""

from tfengine.edge_npu.dynamic_scheduler import DynamicNPUScheduler


def test_dynamic_npu_scheduler_auto_sharding():
    scheduler = DynamicNPUScheduler()
    scheduler._init_state()  # Reset singleton state for clean test

    # 1. Single stream gets full Tri-Core combined (mask = 7)
    mask1 = scheduler.register_stream("cam_01")
    assert mask1 == DynamicNPUScheduler.CORE_ALL
    assert scheduler.get_status()["mode"] == "combined_tri_core"

    # 2. Second stream causes dynamic sharding: cam_01 -> Core 0 (mask=1), cam_02 -> Core 1 (mask=2)
    mask2 = scheduler.register_stream("cam_02")
    assert mask2 == DynamicNPUScheduler.CORE_1
    assert scheduler.get_core_mask("cam_01") == DynamicNPUScheduler.CORE_0
    assert scheduler.get_status()["mode"] == "dynamic_sharded"

    # 3. Third stream gets Core 2 (mask=4)
    mask3 = scheduler.register_stream("cam_03")
    assert mask3 == DynamicNPUScheduler.CORE_2

    # 4. Deregistering down to 1 stream promotes remaining stream back to full Tri-Core
    scheduler.deregister_stream("cam_02")
    scheduler.deregister_stream("cam_03")
    assert scheduler.get_status()["active_stream_count"] == 1
    assert scheduler.get_core_mask("cam_01") == DynamicNPUScheduler.CORE_ALL
    assert scheduler.get_status()["mode"] == "combined_tri_core"

    # 5. Clean teardown
    scheduler.deregister_stream("cam_01")
    assert scheduler.get_status()["active_stream_count"] == 0
